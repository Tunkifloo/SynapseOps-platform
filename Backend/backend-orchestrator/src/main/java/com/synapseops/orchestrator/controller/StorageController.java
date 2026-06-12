package com.synapseops.orchestrator.controller;

import com.synapseops.orchestrator.config.StorageProperties;
import com.synapseops.orchestrator.domain.dto.response.StorageLimitsResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import reactor.core.publisher.Mono;

@RestController
@RequestMapping("/api/v1/storage")
@RequiredArgsConstructor
@Tag(name = "Storage", description = "Límites efectivos del almacenamiento")
@SecurityRequirement(name = "bearerAuth")
public class StorageController {

    private final StorageProperties storageProperties;

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
}
