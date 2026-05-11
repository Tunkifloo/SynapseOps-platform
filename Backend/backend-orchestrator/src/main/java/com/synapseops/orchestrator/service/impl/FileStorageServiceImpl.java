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
        boolean validType = filename.endsWith(".csv")
                || filename.endsWith(".png")
                || filename.endsWith(".jpg")
                || filename.endsWith(".jpeg");

        if (!validType) {
            return Mono.error(new IllegalArgumentException(
                    "Tipo de archivo no permitido. Solo se aceptan: .csv, .png, .jpg, .jpeg"));
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

    private String sanitizeFilename(String filename) {
        return Paths.get(filename).getFileName().toString()
                .replaceAll("[^a-zA-Z0-9._\\-]", "_");
    }
}
