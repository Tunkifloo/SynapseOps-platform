package com.synapseops.orchestrator.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.synapseops.orchestrator.domain.entity.Admin;
import com.synapseops.orchestrator.domain.entity.Collaborator;
import com.synapseops.orchestrator.domain.entity.MLArtifact;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.domain.entity.Workspace;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.mlflow.MLflowFacade;
import com.synapseops.orchestrator.infra.repository.MLArtifactRepository;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.service.impl.WorkspaceModelServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("WorkspaceModelServiceImpl — RBAC del Model Registry (HU-027 · DN-3)")
class WorkspaceModelServiceImplTest {

    @Mock WorkspaceRepository  workspaceRepository;
    @Mock UserRepository       userRepository;
    @Mock MLArtifactRepository artifactRepository;
    @Mock MLflowFacade         mlflowFacade;

    WorkspaceModelServiceImpl service;

    private static final Long WS_ID = 10L;
    private static final String OWNER = "student_owner";
    private static final String OTHER = "student_other";
    private static final String ADMIN_ELSE = "admin_else";

    private Workspace workspace;
    private User owner;

    @BeforeEach
    void setUp() {
        // ObjectMapper real para parsear las métricas embebidas de ml_artifacts.
        service = new WorkspaceModelServiceImpl(
                workspaceRepository, userRepository, artifactRepository, mlflowFacade, new ObjectMapper());

        owner = new Collaborator();
        owner.setIdUser(1L);
        owner.setUsername(OWNER);
        owner.setRole(Role.COLLABORATOR);

        workspace = new Workspace();
        workspace.setIdWorkspace(WS_ID);
        workspace.setName("Proyecto del dueño");
        workspace.setUser(owner);
    }

    private MLArtifact artifact(String runId, String metricsJson) {
        MLArtifact a = new MLArtifact();
        a.setRunId(runId);
        a.setMetrics(metricsJson);
        return a;
    }

    private Map<String, Object> version(String version, String runId, String stage) {
        Map<String, Object> v = new HashMap<>();
        v.put("version", version);
        v.put("runId", runId);
        v.put("stage", stage);
        v.put("status", "READY");
        v.put("creationTimestamp", 0L);
        return v;
    }

    @Nested
    @DisplayName("Lectura (verifyAccess)")
    class Reads {

        @Test
        @DisplayName("El dueño ve solo las versiones cuyo run_id pertenece a su workspace, con métricas embebidas")
        void ownerSeesOwnedVersionsWithMetrics() {
            when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(workspace));
            when(userRepository.findByUsername(OWNER)).thenReturn(Optional.of(owner));
            when(artifactRepository.findByWorkspace(WS_ID)).thenReturn(List.of(
                    artifact("run-1", "{\"final_accuracy\":0.91,\"final_loss\":0.29}")));

            List<Map<String, Object>> versions = new ArrayList<>(List.of(
                    version("2", "run-foreign", "None"),  // de otro workspace → se filtra
                    version("1", "run-1", "Staging")));    // propio
            when(mlflowFacade.getModelVersions("mnist_cnn")).thenReturn(Mono.just(versions));

            StepVerifier.create(service.getModelVersions(WS_ID, "mnist_cnn", OWNER))
                    .assertNext(result -> {
                        org.junit.jupiter.api.Assertions.assertEquals(1, result.size());
                        Map<String, Object> v = result.get(0);
                        org.junit.jupiter.api.Assertions.assertEquals("1", v.get("version"));
                        org.junit.jupiter.api.Assertions.assertEquals(0.91, (double) v.get("accuracy"), 1e-9);
                        org.junit.jupiter.api.Assertions.assertEquals(0.29, (double) v.get("loss"), 1e-9);
                    })
                    .verifyComplete();
        }

        @Test
        @DisplayName("Un colaborador ajeno NO puede leer (AccessDenied)")
        void foreignCollaboratorCannotRead() {
            User other = new Collaborator();
            other.setUsername(OTHER);
            other.setRole(Role.COLLABORATOR);
            when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(workspace));
            when(userRepository.findByUsername(OTHER)).thenReturn(Optional.of(other));

            StepVerifier.create(service.getModelVersions(WS_ID, "mnist_cnn", OTHER))
                    .expectError(AccessDeniedException.class)
                    .verify();
        }

        @Test
        @DisplayName("El ADMIN puede leer modelos de un workspace ajeno (lectura global, DN-3)")
        void adminCanReadForeignWorkspace() {
            User admin = new Admin();
            admin.setUsername(ADMIN_ELSE);
            admin.setRole(Role.ADMIN);
            when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(workspace));
            when(userRepository.findByUsername(ADMIN_ELSE)).thenReturn(Optional.of(admin));
            when(artifactRepository.findByWorkspace(WS_ID)).thenReturn(List.of(artifact("run-1", "{}")));
            when(mlflowFacade.getModelVersions("mnist_cnn"))
                    .thenReturn(Mono.just(new ArrayList<>(List.of(version("1", "run-1", "None")))));

            StepVerifier.create(service.getModelVersions(WS_ID, "mnist_cnn", ADMIN_ELSE))
                    .assertNext(result -> org.junit.jupiter.api.Assertions.assertEquals(1, result.size()))
                    .verifyComplete();
        }

        @Test
        @DisplayName("Workspace inexistente → ResourceNotFound")
        void missingWorkspace() {
            when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.empty());

            StepVerifier.create(service.listModels(WS_ID, OWNER))
                    .expectError(ResourceNotFoundException.class)
                    .verify();
        }
    }

    @Nested
    @DisplayName("Escritura (verifyOwnership + pertenencia de la versión)")
    class Writes {

        @Test
        @DisplayName("El dueño elimina una versión propia → delega en MLflow")
        void ownerDeletesOwnVersion() {
            when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(workspace));
            when(artifactRepository.findByWorkspace(WS_ID)).thenReturn(List.of(artifact("run-1", "{}")));
            when(mlflowFacade.getRunIdForVersion("mnist_cnn", "1")).thenReturn(Mono.just("run-1"));
            when(mlflowFacade.deleteModelVersion("mnist_cnn", "1")).thenReturn(Mono.empty());

            StepVerifier.create(service.deleteVersion(WS_ID, "mnist_cnn", "1", OWNER))
                    .verifyComplete();

            verify(mlflowFacade).deleteModelVersion("mnist_cnn", "1");
        }

        @Test
        @DisplayName("Un colaborador ajeno NO puede eliminar (AccessDenied, sin tocar MLflow)")
        void foreignCannotDelete() {
            when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(workspace));

            StepVerifier.create(service.deleteVersion(WS_ID, "mnist_cnn", "1", OTHER))
                    .expectError(AccessDeniedException.class)
                    .verify();

            verify(mlflowFacade, never()).deleteModelVersion(anyString(), anyString());
        }

        @Test
        @DisplayName("El ADMIN ajeno NO puede eliminar (solo-lectura sobre lo ajeno, DN-3)")
        void foreignAdminCannotDelete() {
            when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(workspace));

            StepVerifier.create(service.deleteVersion(WS_ID, "mnist_cnn", "1", ADMIN_ELSE))
                    .expectError(AccessDeniedException.class)
                    .verify();

            verify(mlflowFacade, never()).deleteModelVersion(anyString(), anyString());
        }

        @Test
        @DisplayName("El dueño NO puede eliminar una versión cuyo run_id no es de su workspace (AccessDenied)")
        void ownerCannotDeleteForeignVersion() {
            when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(workspace));
            when(artifactRepository.findByWorkspace(WS_ID)).thenReturn(List.of(artifact("run-1", "{}")));
            when(mlflowFacade.getRunIdForVersion("otro_modelo", "5")).thenReturn(Mono.just("run-foreign"));

            StepVerifier.create(service.deleteVersion(WS_ID, "otro_modelo", "5", OWNER))
                    .expectError(AccessDeniedException.class)
                    .verify();

            verify(mlflowFacade, never()).deleteModelVersion(anyString(), anyString());
        }

        @Test
        @DisplayName("El dueño transiciona el stage de una versión propia → delega en MLflow")
        void ownerTransitionsStage() {
            when(workspaceRepository.findById(WS_ID)).thenReturn(Optional.of(workspace));
            when(artifactRepository.findByWorkspace(WS_ID)).thenReturn(List.of(artifact("run-1", "{}")));
            when(mlflowFacade.getRunIdForVersion("mnist_cnn", "1")).thenReturn(Mono.just("run-1"));
            when(mlflowFacade.transitionStage("mnist_cnn", "1", "Production"))
                    .thenReturn(Mono.just(Map.of("stage", "Production")));

            StepVerifier.create(service.transitionStage(WS_ID, "mnist_cnn", "1", "Production", OWNER))
                    .assertNext(r -> org.junit.jupiter.api.Assertions.assertEquals("Production", r.get("stage")))
                    .verifyComplete();

            verify(mlflowFacade).transitionStage(eq("mnist_cnn"), eq("1"), eq("Production"));
        }
    }
}
