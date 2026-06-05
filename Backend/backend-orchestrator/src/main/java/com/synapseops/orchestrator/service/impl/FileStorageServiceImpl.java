package com.synapseops.orchestrator.service.impl;

import com.synapseops.orchestrator.config.StorageProperties;
import com.synapseops.orchestrator.service.FileStorageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.codec.multipart.FilePart;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;

@Slf4j
@Service
@RequiredArgsConstructor
public class FileStorageServiceImpl implements FileStorageService {

    private final StorageProperties storageProperties;

    @Override
    public Mono<String> store(FilePart file, Long userId, Long workspaceId) {
        return validateFile(file)
                .flatMap(validFile -> {
                    Path targetDir  = resolveDir(userId, workspaceId);
                    Path targetFile = targetDir.resolve(
                            sanitizeFilename(validFile.filename()));

                    return Mono.fromCallable(() -> {
                                Files.createDirectories(targetDir);
                                return targetFile;
                            })
                            .subscribeOn(Schedulers.boundedElastic())
                            .flatMap(path -> validFile.transferTo(path)
                                    .thenReturn(path.toAbsolutePath().toString()));
                })
                .doOnSuccess(path ->
                        log.info("Dataset almacenado: {}", path))
                .doOnError(ex ->
                        log.error("Error al almacenar dataset: {}", ex.getMessage()));
    }

    @Override
    public Mono<String> getPath(String filename, Long userId, Long workspaceId) {
        return Mono.fromCallable(() -> {
            Path filePath = resolveDir(userId, workspaceId)
                    .resolve(sanitizeFilename(filename));

            if (!Files.exists(filePath)) {
                throw new IllegalArgumentException(
                        String.format("Dataset '%s' no encontrado.", filename));
            }
            return filePath.toAbsolutePath().toString();
        }).subscribeOn(Schedulers.boundedElastic());
    }

    @Override
    public Mono<Void> delete(String filename, Long userId, Long workspaceId) {
        return Mono.fromRunnable(() -> {
            Path filePath = resolveDir(userId, workspaceId)
                    .resolve(sanitizeFilename(filename));
            try {
                boolean deleted = Files.deleteIfExists(filePath);
                if (deleted) {
                    log.info("Dataset eliminado: {}", filePath);
                } else {
                    log.warn("Dataset no encontrado para eliminar: {}", filePath);
                }
            } catch (IOException e) {
                throw new RuntimeException("Error al eliminar el dataset: " + e.getMessage());
            }
        }).subscribeOn(Schedulers.boundedElastic()).then();
    }

    private Path resolveDir(Long userId, Long workspaceId) {
        return Paths.get(storageProperties.getBasePath())
                .resolve(String.valueOf(userId))
                .resolve(String.valueOf(workspaceId))
                .resolve("datasets");
    }

    private Mono<FilePart> validateFile(FilePart file) {
        String filename = file.filename().toLowerCase();
        boolean validType = filename.endsWith(".png")
                || filename.endsWith(".jpg")
                || filename.endsWith(".jpeg")
                || filename.endsWith(".zip");

        if (!validType) {
            return Mono.error(new IllegalArgumentException(
                    "Solo se aceptan datasets de imágenes (.png, .jpg, .jpeg) o archivos comprimidos (.zip)."));
        }

        long maxBytes = storageProperties.getMaxFileSizeMb() * 1024 * 1024;
        long contentLength = file.headers().getContentLength();

        if (contentLength > 0 && contentLength > maxBytes) {
            return Mono.error(new IllegalArgumentException(
                    String.format("El archivo supera el tamaño máximo permitido de %d MB.",
                            storageProperties.getMaxFileSizeMb())));
        }

        return Mono.just(file);
    }

    public Mono<Boolean> hasImagesInZip(FilePart file) {
        String filename = file.filename().toLowerCase();
        if (!filename.endsWith(".zip")) {
            return Mono.just(true);
        }

        return Mono.fromCallable(() -> {
            Path tempFile = Files.createTempFile("ds_", ".zip");
            try {
                file.transferTo(tempFile).block();
                try (java.util.zip.ZipInputStream zis = new java.util.zip.ZipInputStream(
                        new java.io.FileInputStream(tempFile.toFile()))) {
                    java.util.zip.ZipEntry entry;
                    // Recorre TODO el zip: basta con que exista al menos una imagen.
                    // Los archivos auxiliares (README, labels.csv, .DS_Store, etc.) se ignoran,
                    // de modo que los datasets estructurados train/val/test no se rechazan.
                    while ((entry = zis.getNextEntry()) != null) {
                        String name = entry.getName().toLowerCase();
                        if (name.endsWith(".png") || name.endsWith(".jpg") || name.endsWith(".jpeg")) {
                            return true;
                        }
                    }
                }
                return false;
            } finally {
                Files.deleteIfExists(tempFile);
            }
        }).subscribeOn(Schedulers.boundedElastic());
    }

    private String sanitizeFilename(String filename) {
        return Paths.get(filename).getFileName().toString()
                .replaceAll("[^a-zA-Z0-9._\\-]", "_");
    }
}
