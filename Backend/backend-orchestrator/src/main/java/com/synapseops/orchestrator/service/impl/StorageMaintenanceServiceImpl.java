package com.synapseops.orchestrator.service.impl;

import com.synapseops.orchestrator.config.StorageProperties;
import com.synapseops.orchestrator.service.StorageMaintenanceService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.FileSystemUtils;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.stream.Stream;

@Slf4j
@Service
@RequiredArgsConstructor
public class StorageMaintenanceServiceImpl implements StorageMaintenanceService {

    /** Subdirectorios que el ml-engine crea bajo /storage/{workspaceId}. */
    private static final String[] ENGINE_DIRS = {"extracted", "models", "downloads"};
    private static final String[] INTERMEDIATE_DIRS = {"extracted", "downloads"};

    private final StorageProperties storageProperties;

    @Override
    public void purgeWorkspace(long userId, long workspaceId) {
        // 1) Datasets del orquestador: /storage/{userId}/{workspaceId} (namespaced, seguro).
        deleteRecursively(base().resolve(String.valueOf(userId)).resolve(String.valueOf(workspaceId)));
        // 2) Artefactos del ml-engine: subdirectorios conocidos bajo /storage/{workspaceId}.
        for (String dir : ENGINE_DIRS) {
            deleteRecursively(base().resolve(String.valueOf(workspaceId)).resolve(dir));
        }
        log.info("Storage purgado para workspace {} (userId {}).", workspaceId, userId);
    }

    @Override
    public void purgeIntermediate(long workspaceId) {
        for (String dir : INTERMEDIATE_DIRS) {
            deleteRecursively(base().resolve(String.valueOf(workspaceId)).resolve(dir));
        }
        log.info("Artefactos intermedios purgados para workspace {}.", workspaceId);
    }

    @Override
    public long workspaceUsageBytes(long userId, long workspaceId) {
        long datasets = dirSize(base().resolve(String.valueOf(userId)).resolve(String.valueOf(workspaceId)));
        long engine = 0L;
        for (String dir : ENGINE_DIRS) {
            engine += dirSize(base().resolve(String.valueOf(workspaceId)).resolve(dir));
        }
        return datasets + engine;
    }

    private Path base() {
        return Paths.get(storageProperties.getBasePath());
    }

    /** Borrado recursivo idempotente (no falla si la ruta no existe). */
    private void deleteRecursively(Path path) {
        try {
            boolean existed = FileSystemUtils.deleteRecursively(path);
            if (existed) {
                log.debug("Borrado recursivo: {}", path);
            }
        } catch (IOException e) {
            // No abortamos el flujo de negocio por un fallo de limpieza; sólo se audita.
            log.warn("No se pudo borrar {} ({}). Quedará como huérfano.", path, e.getMessage());
        }
    }

    /** Suma el tamaño de todos los archivos bajo una ruta (0 si no existe). */
    private long dirSize(Path path) {
        if (!Files.exists(path)) {
            return 0L;
        }
        try (Stream<Path> walk = Files.walk(path)) {
            return walk.filter(Files::isRegularFile)
                    .mapToLong(p -> {
                        try {
                            return Files.size(p);
                        } catch (IOException e) {
                            return 0L;
                        }
                    })
                    .sum();
        } catch (IOException e) {
            log.warn("No se pudo calcular el tamaño de {} ({}).", path, e.getMessage());
            return 0L;
        }
    }
}
