package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.config.StorageProperties;
import com.synapseops.orchestrator.domain.dto.response.StorageLimitsResponse;
import com.synapseops.orchestrator.domain.dto.response.StorageUsageResponse;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.service.StorageMaintenanceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;

import java.security.Principal;
import java.util.ArrayList;
import java.util.List;

@RestController
@RequestMapping("/api/v1/storage")
@RequiredArgsConstructor
@Tag(name = "Storage", description = "Límites y uso del almacenamiento")
@SecurityRequirement(name = "bearerAuth")
public class StorageController {

    private final StorageProperties storageProperties;
    private final StorageMaintenanceService storageMaintenance;
    private final WorkspaceRepository workspaceRepository;
    private final UserRepository userRepository;

    @Operation(summary = "Límites de almacenamiento",
            description = "Devuelve el tamaño máximo por archivo, la cuota por workspace y las "
                    + "extensiones aceptadas. Fuente única para que el frontend no hardcodee valores.")
    @ApiResponse(responseCode = "200", description = "Límites efectivos del backend")
    @GetMapping("/limits")
    public Mono<StorageLimitsResponse> limits() {
        return Mono.just(new StorageLimitsResponse(
                storageProperties.getMaxFileSizeMb(),
                storageProperties.getMaxWorkspaceMb(),
                storageProperties.getAllowedExtensions()));
    }

    @Operation(summary = "Uso de almacenamiento del usuario",
            description = "Uso de disco real por workspace (datasets + artefactos del ml-engine) "
                    + "frente a la cuota, para que el usuario gestione su espacio.")
    @ApiResponse(responseCode = "200", description = "Uso por workspace + límites")
    @GetMapping("/usage")
    public Mono<StorageUsageResponse> usage(Mono<Principal> principal) {
        return principal.flatMap(p -> Mono.fromCallable(() -> {
            User user = userRepository.findByUsername(p.getName())
                    .orElseThrow(() -> new ResourceNotFoundException("Usuario no encontrado: " + p.getName()));
            long userId = user.getIdUser();

            List<StorageUsageResponse.WorkspaceUsage> rows = new ArrayList<>();
            long total = 0L;
            for (var ws : workspaceRepository.findByUser_IdUserAndUser_EnabledTrue(userId)) {
                long used = storageMaintenance.workspaceUsageBytes(userId, ws.getIdWorkspace());
                total += used;
                rows.add(new StorageUsageResponse.WorkspaceUsage(
                        ws.getIdWorkspace(), ws.getName(), used));
            }
            return new StorageUsageResponse(
                    storageProperties.getMaxFileSizeMb(),
                    storageProperties.getMaxWorkspaceMb(),
                    total,
                    rows);
        }).subscribeOn(Schedulers.boundedElastic()));
    }
}
