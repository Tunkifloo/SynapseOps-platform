package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.config.StorageProperties;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.service.FileStorageService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
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
import java.util.Map;

@RestController
@RequestMapping("/api/v1/workspaces/{workspaceId}/dataset")
@RequiredArgsConstructor
@Tag(name = "Datasets", description = "Carga y eliminación de datasets por workspace")
@SecurityRequirement(name = "bearerAuth")
public class DatasetController {

    private final FileStorageService  fileStorageService;
    private final WorkspaceRepository workspaceRepository;
    private final StorageProperties   storageProperties;

    @Operation(summary = "Subir dataset",
            description = "Acepta .csv, .png, .jpg — máx 500 MB")
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
                                            deletePrevious = fileStorageService
                                                    .delete(oldFilename, userId, workspaceId);
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
        String url = body.get("url");
        if (url == null || url.isBlank()) {
            return Mono.just(ResponseEntity.badRequest()
                    .body("La URL del repositorio es obligatoria."));
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
                                        String filename = extractFilenameFromUrl(resolvedUrl);
                                        Path targetDir = Paths.get(storageProperties.getBasePath())
                                                .resolve(String.valueOf(userId))
                                                .resolve(String.valueOf(workspaceId))
                                                .resolve("datasets");
                                        Path targetFile = targetDir.resolve(sanitizeFilename(filename));

                                        Mono<Void> deletePrevious = Mono.empty();
                                        if (workspace.getDatasetPath() != null) {
                                            String oldName = Paths.get(workspace.getDatasetPath())
                                                    .getFileName().toString();
                                            deletePrevious = fileStorageService.delete(oldName, userId, workspaceId);
                                        }

                                        return deletePrevious
                                                .then(Mono.fromCallable(() -> {
                                                    Files.createDirectories(targetDir);
                                                    try (java.io.InputStream in =
                                                                 new java.net.URI(resolvedUrl).toURL().openStream()) {
                                                        Files.copy(in, targetFile,
                                                                java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                                    } catch (java.io.FileNotFoundException e) {
                                                        if (resolvedUrl.contains("/main.zip")) {
                                                            String fallback = resolvedUrl.replace("/main.zip", "/master.zip");
                                                            try (java.io.InputStream in2 =
                                                                         new java.net.URI(fallback).toURL().openStream()) {
                                                                Files.copy(in2, targetFile,
                                                                        java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                                                            }
                                                        } else {
                                                            throw e;
                                                        }
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
                                                                                     new java.io.FileInputStream(storedPath))) {
                                                                    java.util.zip.ZipEntry entry;
                                                                    while ((entry = zis.getNextEntry()) != null) {
                                                                        String entryName = entry.getName().toLowerCase();
                                                                        if (entryName.endsWith(".png")
                                                                                || entryName.endsWith(".jpg")
                                                                                || entryName.endsWith(".jpeg")) {
                                                                            hasImages = true;
                                                                            break;
                                                                        }
                                                                    }
                                                                }
                                                                if (!hasImages) {
                                                                    Files.deleteIfExists(Path.of(storedPath));
                                                                    throw new IllegalArgumentException(
                                                                            "El archivo descargado no contiene imágenes válidas (.png, .jpg, .jpeg).");
                                                                }
                                                            } else if (!name.endsWith(".png")
                                                                    && !name.endsWith(".jpg")
                                                                    && !name.endsWith(".jpeg")) {
                                                                Files.deleteIfExists(Path.of(storedPath));
                                                                throw new IllegalArgumentException(
                                                                        "Solo se aceptan imágenes (.png, .jpg, .jpeg) o archivos .zip con imágenes.");
                                                            }
                                                            workspace.setDatasetPath(storedPath);
                                                            workspaceRepository.save(workspace);
                                                            return storedPath;
                                                        }).subscribeOn(Schedulers.boundedElastic()))
                                                .onErrorResume(java.io.IOException.class, ex ->
                                                        Mono.error(new IllegalArgumentException(
                                                                "No se pudo descargar desde la URL: " + ex.getMessage())));
                                    });
                        })
        ).map(path -> ResponseEntity.ok("Dataset descargado correctamente. Path: " + path));
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
