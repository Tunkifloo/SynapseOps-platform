package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.config.StorageProperties;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.service.FileStorageService;
import com.synapseops.orchestrator.service.StorageMaintenanceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.web.bind.annotation.*;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.security.Principal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/dataset")
@RequiredArgsConstructor
@Slf4j
@Tag(name = "Datasets", description = "Carga y eliminación de datasets por workspace")
@SecurityRequirement(name = "bearerAuth")
public class DatasetController {

    private final FileStorageService  fileStorageService;
    private final WorkspaceRepository workspaceRepository;
    private final StorageProperties   storageProperties;
    private final StorageMaintenanceService storageMaintenance;

    @Operation(summary = "Subir dataset",
            description = "Acepta imágenes (.png/.jpg/.jpeg) o .zip con imágenes. El tamaño "
                    + "máximo por archivo y la cuota del workspace los define el backend "
                    + "(ver GET /api/v1/storage/limits).")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Dataset almacenado, retorna path"),
            @ApiResponse(responseCode = "400", description = "Formato o tamaño inválido"),
            @ApiResponse(responseCode = "403", description = "Sin permisos sobre el workspace"),
            @ApiResponse(responseCode = "404", description = "Workspace no existe")
    })
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public Mono<ResponseEntity<String>> upload(
            @PathVariable Long workspaceId,
            @RequestPart("file") FilePart file,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                Mono.fromCallable(() -> workspaceRepository.findById(workspaceId)
                                .orElseThrow(() ->
                                        new ResourceNotFoundException("Workspace", workspaceId)))
                        .subscribeOn(Schedulers.boundedElastic())
                        .flatMap(workspace -> {
                            if (!workspace.getUser().getUsername().equals(p.getName())) {
                                return Mono.error(new org.springframework.security.access
                                        .AccessDeniedException("Sin permisos sobre este workspace."));
                            }
                            Long userId = workspace.getUser().getIdUser();
                            return fileStorageService.hasImagesInZip(file)
                                    .flatMap(hasImages -> {
                                        if (!hasImages) {
                                            return Mono.error(new IllegalArgumentException(
                                                    "El archivo .zip no contiene imágenes válidas (.png, .jpg, .jpeg)."));
                                        }
                                        Mono<Void> deletePrevious = Mono.empty();
                                        if (workspace.getDatasetPath() != null) {
                                            String oldFilename = Paths.get(workspace.getDatasetPath())
                                                    .getFileName().toString();
                                            // Al reemplazar el dataset, el material extraído del
                                            // anterior queda obsoleto → se purga (no toca models).
                                            deletePrevious = fileStorageService
                                                    .delete(oldFilename, userId, workspaceId)
                                                    .then(Mono.fromRunnable(() ->
                                                            storageMaintenance.purgeIntermediate(workspaceId))
                                                            .subscribeOn(Schedulers.boundedElastic()).then());
                                        }
                                        return deletePrevious
                                                .then(fileStorageService.store(file, userId, workspaceId))
                                                .flatMap(storedPath ->
                                                        Mono.fromCallable(() -> {
                                                            workspace.setDatasetPath(storedPath);
                                                            workspaceRepository.save(workspace);
                                                            return storedPath;
                                                        }).subscribeOn(Schedulers.boundedElastic()));
                                    });
                        })
        ).map(path -> ResponseEntity.ok("Dataset cargado correctamente. Path: " + path));
    }

    @Operation(summary = "Eliminar dataset")
    @ApiResponses({
            @ApiResponse(responseCode = "204", description = "Eliminado"),
            @ApiResponse(responseCode = "403", description = "Sin permisos"),
            @ApiResponse(responseCode = "404", description = "Workspace o archivo no existe")
    })
    @DeleteMapping("/{filename}")
    public Mono<ResponseEntity<Void>> delete(
            @PathVariable Long workspaceId,
            @PathVariable String filename,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                Mono.fromCallable(() -> workspaceRepository.findById(workspaceId)
                                .orElseThrow(() ->
                                        new ResourceNotFoundException("Workspace", workspaceId)))
                        .subscribeOn(Schedulers.boundedElastic())
                        .flatMap(workspace -> {
                            if (!workspace.getUser().getUsername().equals(p.getName())) {
                                return Mono.error(new org.springframework.security.access
                                        .AccessDeniedException("Sin permisos sobre este workspace."));
                            }
                            Long userId = workspace.getUser().getIdUser();
                            return fileStorageService.delete(filename, userId, workspaceId)
                                    .then(Mono.fromRunnable(() -> {
                                        workspace.setDatasetPath(null);
                                        workspaceRepository.save(workspace);
                                        // Sin dataset, los artefactos intermedios ya no aplican.
                                        storageMaintenance.purgeIntermediate(workspaceId);
                                    }).subscribeOn(Schedulers.boundedElastic()));
                        })
        ).thenReturn(ResponseEntity.<Void>noContent().build());
    }

    @Operation(summary = "Descargar dataset desde URL",
            description = "Descarga un dataset de imágenes desde una URL y lo almacena en el workspace")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Dataset descargado y almacenado"),
            @ApiResponse(responseCode = "400", description = "URL inválida o contenido no soportado"),
            @ApiResponse(responseCode = "403", description = "Sin permisos sobre el workspace"),
            @ApiResponse(responseCode = "404", description = "Workspace no existe")
    })
    @PostMapping("/url")
    public Mono<ResponseEntity<String>> downloadFromUrl(
            @PathVariable Long workspaceId,
            @RequestBody Map<String, String> body,
            Mono<Principal> principal) {

        String url          = body.get("url");
        String kerasDataset = body.get("kerasDataset");

        if (kerasDataset != null && !kerasDataset.isBlank()) {
            // Solo datasets que el ml-engine carga de forma fiable sin TensorFlow.
            List<String> supported = List.of("mnist", "fashion_mnist");

            if (!supported.contains(kerasDataset.toLowerCase())) {
                return Mono.just(ResponseEntity.badRequest()
                        .body("Dataset Keras no soportado. Disponibles: " + supported));
            }

            return principal.flatMap(p ->
                    Mono.fromCallable(() -> workspaceRepository.findById(workspaceId)
                                    .orElseThrow(() ->
                                            new ResourceNotFoundException("Workspace", workspaceId)))
                            .subscribeOn(Schedulers.boundedElastic())
                            .flatMap(workspace -> {
                                if (!workspace.getUser().getUsername().equals(p.getName())) {
                                    return Mono.error(new org.springframework.security.access
                                            .AccessDeniedException("Sin permisos sobre este workspace."));
                                }
                                String datasetRef = "keras://" + kerasDataset.toLowerCase();
                                return Mono.fromCallable(() -> {
                                    workspace.setDatasetPath(datasetRef);
                                    workspaceRepository.save(workspace);
                                    return datasetRef;
                                }).subscribeOn(Schedulers.boundedElastic());
                            })
            ).map(ref -> ResponseEntity.ok(
                    "Dataset Keras registrado: " + ref +
                            " — se cargará en el ml-engine al entrenar."));
        }

        if (url == null || url.isBlank()) {
            return Mono.just(ResponseEntity.badRequest()
                    .body("Se requiere 'url' o 'kerasDataset' en el body."));
        }

        return principal.flatMap(p ->
                Mono.fromCallable(() -> workspaceRepository.findById(workspaceId)
                                .orElseThrow(() ->
                                        new ResourceNotFoundException("Workspace", workspaceId)))
                        .subscribeOn(Schedulers.boundedElastic())
                        .flatMap(workspace -> {
                            if (!workspace.getUser().getUsername().equals(p.getName())) {
                                return Mono.error(new org.springframework.security.access
                                        .AccessDeniedException("Sin permisos sobre este workspace."));
                            }
                            Long userId = workspace.getUser().getIdUser();

                            return Mono.fromCallable(() -> resolveDownloadUrl(url))
                                    .subscribeOn(Schedulers.boundedElastic())
                                    .flatMap(resolvedUrl -> {
                                        String filename   = extractFilenameFromUrl(resolvedUrl);
                                        Path targetDir    = Paths.get(storageProperties.getBasePath())
                                                .resolve(String.valueOf(userId))
                                                .resolve(String.valueOf(workspaceId))
                                                .resolve("datasets");
                                        Path targetFile   = targetDir.resolve(
                                                sanitizeFilename(filename));

                                        Mono<Void> deletePrevious = Mono.empty();
                                        if (workspace.getDatasetPath() != null
                                                && !workspace.getDatasetPath()
                                                .startsWith("keras://")) {
                                            String oldName = Paths.get(
                                                            workspace.getDatasetPath())
                                                    .getFileName().toString();
                                            deletePrevious = fileStorageService
                                                    .delete(oldName, userId, workspaceId)
                                                    .then(Mono.fromRunnable(() ->
                                                            storageMaintenance.purgeIntermediate(workspaceId))
                                                            .subscribeOn(Schedulers.boundedElastic()).then());
                                        }

                                        return deletePrevious
                                                .then(Mono.fromCallable(() -> {
                                                    // 1) Preparar almacenamiento.
                                                    try {
                                                        Files.createDirectories(targetDir);
                                                    } catch (java.io.IOException e) {
                                                        log.error("Ingesta URL: no se pudo crear el "
                                                                + "directorio de datasets {}", targetDir, e);
                                                        throw new IllegalArgumentException(
                                                                "No se pudo preparar el almacenamiento del "
                                                                + "dataset en el servidor (revisa el volumen "
                                                                + "/storage y sus permisos).");
                                                    }
                                                    // 2) Descargar el recurso remoto. Se usa un User-Agent
                                                    //    de navegador: GCS/CDNs rechazan el agente Java por
                                                    //    defecto con 403.
                                                    log.info("Ingesta URL: descargando {} → {}",
                                                            resolvedUrl, targetFile);
                                                    try {
                                                        downloadToFile(resolvedUrl, targetFile);
                                                    } catch (java.io.FileNotFoundException e) {
                                                        // Repo sin rama main → intenta master.
                                                        if (resolvedUrl.contains("/main.zip")) {
                                                            String fallback = resolvedUrl
                                                                    .replace("/main.zip", "/master.zip");
                                                            try {
                                                                downloadToFile(fallback, targetFile);
                                                            } catch (Exception e2) {
                                                                log.error("Ingesta URL: fallback {} falló",
                                                                        fallback, e2);
                                                                throw new IllegalArgumentException(
                                                                        "No se pudo descargar el dataset: la "
                                                                        + "URL no existe o no es accesible (404).");
                                                            }
                                                        } else {
                                                            log.error("Ingesta URL: recurso no encontrado {}",
                                                                    resolvedUrl, e);
                                                            throw new IllegalArgumentException(
                                                                    "No se pudo descargar el dataset: la URL "
                                                                    + "devolvió 404 (no encontrado). Verifica "
                                                                    + "que apunte directamente a un archivo .zip.");
                                                        }
                                                    } catch (java.net.UnknownHostException
                                                            | java.net.ConnectException e) {
                                                        log.error("Ingesta URL: host inaccesible {}",
                                                                resolvedUrl, e);
                                                        throw new IllegalArgumentException(
                                                                "No se pudo conectar con la URL. ¿El servidor "
                                                                + "tiene acceso a internet y la URL es pública?");
                                                    } catch (java.io.IOException
                                                            | java.net.URISyntaxException e) {
                                                        log.error("Ingesta URL: error descargando {}",
                                                                resolvedUrl, e);
                                                        throw new IllegalArgumentException(
                                                                "No se pudo descargar el dataset desde la URL ("
                                                                + e.getMessage() + ").");
                                                    }
                                                    return targetFile.toAbsolutePath().toString();
                                                }).subscribeOn(Schedulers.boundedElastic()))
                                                .flatMap(storedPath ->
                                                        Mono.fromCallable(() -> {
                                                            String name = storedPath.toLowerCase();
                                                            if (name.endsWith(".zip")) {
                                                                boolean hasImages = false;
                                                                try (java.util.zip.ZipInputStream zis =
                                                                             new java.util.zip.ZipInputStream(
                                                                                     new java.io.FileInputStream(
                                                                                             storedPath))) {
                                                                    java.util.zip.ZipEntry entry;
                                                                    while ((entry = zis.getNextEntry())
                                                                            != null) {
                                                                        String e2 = entry.getName()
                                                                                .toLowerCase();
                                                                        if (e2.endsWith(".png")
                                                                                || e2.endsWith(".jpg")
                                                                                || e2.endsWith(".jpeg")) {
                                                                            hasImages = true;
                                                                            break;
                                                                        }
                                                                    }
                                                                }
                                                                if (!hasImages) {
                                                                    Files.deleteIfExists(
                                                                            Path.of(storedPath));
                                                                    throw new IllegalArgumentException(
                                                                            "El archivo descargado no "
                                                                                    + "contiene imágenes válidas "
                                                                                    + "(.png, .jpg, .jpeg).");
                                                                }
                                                            } else if (!name.endsWith(".png")
                                                                    && !name.endsWith(".jpg")
                                                                    && !name.endsWith(".jpeg")) {
                                                                Files.deleteIfExists(
                                                                        Path.of(storedPath));
                                                                throw new IllegalArgumentException(
                                                                        "Solo se aceptan imágenes "
                                                                                + "(.png, .jpg, .jpeg) o "
                                                                                + ".zip con imágenes.");
                                                            }
                                                            workspace.setDatasetPath(storedPath);
                                                            workspaceRepository.save(workspace);
                                                            return storedPath;
                                                        }).subscribeOn(Schedulers.boundedElastic()))
                                                .onErrorResume(java.io.IOException.class, ex -> {
                                                    log.error("Ingesta URL: error procesando el archivo "
                                                            + "descargado de {}", resolvedUrl, ex);
                                                    return Mono.error(new IllegalArgumentException(
                                                            "No se pudo procesar el archivo descargado "
                                                            + "(¿es un .zip válido con imágenes .png/.jpg?)."));
                                                });
                                    });
                        })
        ).map(path -> ResponseEntity.ok(
                "Dataset descargado correctamente. Path: " + path));
    }

    /**
     * Descarga un recurso a un archivo enviando un User-Agent de navegador
     * (GCS/CDNs devuelven 403 al agente Java por defecto) y siguiendo redirects.
     * Lanza {@link java.io.FileNotFoundException} en 404 (para el fallback main→master)
     * y {@link IllegalArgumentException} con mensaje claro en otros 4xx/5xx.
     */
    private void downloadToFile(String urlStr, Path target)
            throws java.io.IOException, java.net.URISyntaxException {
        java.net.HttpURLConnection conn = (java.net.HttpURLConnection)
                new java.net.URI(urlStr).toURL().openConnection();
        conn.setRequestProperty("User-Agent",
                "Mozilla/5.0 (compatible; SynapseOps/1.0; dataset-ingest)");
        conn.setRequestProperty("Accept", "*/*");
        conn.setConnectTimeout(15_000);
        conn.setReadTimeout(120_000);
        conn.setInstanceFollowRedirects(true);

        int code = conn.getResponseCode();
        if (code == 404) {
            conn.disconnect();
            throw new java.io.FileNotFoundException(urlStr);
        }
        if (code == 401 || code == 403) {
            conn.disconnect();
            log.error("Ingesta URL: acceso denegado ({}) para {}", code, urlStr);
            throw new IllegalArgumentException(
                    "La URL devolvió " + code + " (acceso denegado): no es pública o requiere "
                    + "autenticación. Usa un enlace de descarga directa a un .zip sin login "
                    + "(p. ej. un release de GitHub o un bucket público).");
        }
        if (code >= 400) {
            conn.disconnect();
            log.error("Ingesta URL: el servidor respondió {} para {}", code, urlStr);
            throw new IllegalArgumentException(
                    "El servidor respondió " + code + " al descargar el dataset. "
                    + "Asegúrate de que la URL sea pública y de descarga directa (.zip).");
        }
        try (java.io.InputStream in = conn.getInputStream()) {
            Files.copy(in, target, java.nio.file.StandardCopyOption.REPLACE_EXISTING);
        } finally {
            conn.disconnect();
        }
    }

    private String resolveDownloadUrl(String url) {
        String trimmed = url.trim();
        if (trimmed.endsWith(".git")) {
            String base = trimmed.replaceAll("\\.git$", "");
            return base + "/archive/refs/heads/main.zip";
        }
        if (trimmed.contains("github.com") && !trimmed.endsWith(".zip") && !isImageUrl(trimmed)) {
            return trimmed.replaceAll("/$", "") + "/archive/refs/heads/main.zip";
        }
        return trimmed;
    }

    private boolean isImageUrl(String url) {
        String lower = url.toLowerCase();
        return lower.endsWith(".png") || lower.endsWith(".jpg")
                || lower.endsWith(".jpeg") || lower.endsWith(".zip");
    }

    @Operation(summary = "Descargar dataset",
            description = "Retorna el archivo del dataset para visualización o descarga")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Archivo retornado"),
            @ApiResponse(responseCode = "403", description = "Sin permisos sobre el workspace"),
            @ApiResponse(responseCode = "404", description = "Workspace o archivo no existe")
    })
    @GetMapping("/{filename}")
    public Mono<ResponseEntity<org.springframework.core.io.Resource>> download(
            @PathVariable Long workspaceId,
            @PathVariable String filename,
            Mono<Principal> principal) {
        return principal.flatMap(p ->
                Mono.fromCallable(() -> workspaceRepository.findById(workspaceId)
                                .orElseThrow(() ->
                                        new ResourceNotFoundException("Workspace", workspaceId)))
                        .subscribeOn(Schedulers.boundedElastic())
                        .flatMap(workspace -> {
                            if (!workspace.getUser().getUsername().equals(p.getName())) {
                                return Mono.error(new org.springframework.security.access
                                        .AccessDeniedException("Sin permisos sobre este workspace."));
                            }
                            Long userId = workspace.getUser().getIdUser();
                            return fileStorageService.getPath(filename, userId, workspaceId)
                                    .map(path -> {
                                        org.springframework.core.io.Resource resource =
                                                new org.springframework.core.io.FileSystemResource(path);
                                        return ResponseEntity.ok()
                                                .contentType(org.springframework.http.MediaType
                                                        .parseMediaType(detectContentType(filename)))
                                                .body(resource);
                                    });
                        })
        );
    }

    private String detectContentType(String filename) {
        String lower = filename.toLowerCase();
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        return "application/octet-stream";
    }

    private String extractFilenameFromUrl(String url) {
        String path = url.replaceAll("\\?.*$", "");
        String name = path.substring(path.lastIndexOf('/') + 1);
        if (name.isEmpty()) name = "dataset";
        if (name.endsWith(".git")) name = name.replaceAll("\\.git$", ".zip");
        if (!name.contains(".")) name = name + ".zip";
        return name;
    }

    private String sanitizeFilename(String filename) {
        return Paths.get(filename).getFileName().toString()
                .replaceAll("[^a-zA-Z0-9._\\-]", "_");
    }
}
