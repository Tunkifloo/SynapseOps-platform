package com.synapseops.orchestrator.service;

import org.springframework.http.codec.multipart.FilePart;
import reactor.core.publisher.Mono;

public interface FileStorageService {
    Mono<String> store(FilePart file, Long userId, Long workspaceId);
    Mono<String> getPath(String filename, Long userId, Long workspaceId);
    Mono<Void> delete(String filename, Long userId, Long workspaceId);
}
