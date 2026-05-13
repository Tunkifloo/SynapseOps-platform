package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.request.PipelineRequest;
import com.synapseops.orchestrator.domain.dto.response.PipelineResponse;
import com.synapseops.orchestrator.domain.entity.*;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.PipelineRepository;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.mapper.PipelineMapper;
import com.synapseops.orchestrator.service.impl.PipelineServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.access.AccessDeniedException;
import reactor.test.StepVerifier;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("PipelineServiceImpl — Tests unitarios")
class PipelineServiceImplTest {

    @Mock PipelineRepository  pipelineRepository;
    @Mock UserRepository      userRepository;
    @Mock WorkspaceRepository workspaceRepository;
    @Mock PipelineMapper      pipelineMapper;

    @InjectMocks PipelineServiceImpl pipelineService;

    private User      owner;
    private User      otherUser;
    private User      adminUser;
    private Workspace workspace;
    private Pipeline  pipeline;
    private PipelineResponse pipelineResponse;

    @BeforeEach
    void setUp() {
        owner = new Collaborator();
        owner.setIdUser(1L);
        owner.setUsername("student_one");
        owner.setRole(Role.COLLABORATOR);
        owner.setEnabled(true);

        otherUser = new Collaborator();
        otherUser.setIdUser(2L);
        otherUser.setUsername("student_two");
        otherUser.setRole(Role.COLLABORATOR);
        otherUser.setEnabled(true);

        adminUser = new Admin();
        adminUser.setIdUser(3L);
        adminUser.setUsername("admin_root");
        adminUser.setRole(Role.ADMIN);
        adminUser.setEnabled(true);

        workspace = new Workspace();
        workspace.setIdWorkspace(10L);
        workspace.setName("Mi Workspace");
        workspace.setUser(owner);

        pipeline = new Pipeline();
        pipeline.setIdPipeline(100L);
        pipeline.setName("Pipeline de Clasificación");
        pipeline.setStatus(PipelineStatus.DRAFT);
        pipeline.setWorkspace(workspace);

        pipelineResponse = new PipelineResponse(
                100L, "Pipeline de Clasificación",
                PipelineStatus.DRAFT, 10L, 0, 0
        );
    }

    @Nested
    @DisplayName("getPipelinesByWorkspace()")
    class GetPipelinesByWorkspace {

        @Test
        @DisplayName("Debe retornar pipelines del workspace cuando el usuario es propietario")
        void shouldReturnPipelinesForOwner() {
            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));
            when(pipelineRepository.findByWorkspace_IdWorkspace(10L))
                    .thenReturn(List.of(pipeline));
            when(pipelineMapper.toResponse(pipeline)).thenReturn(pipelineResponse);

            StepVerifier.create(pipelineService.getPipelinesByWorkspace(10L, "student_one"))
                    .expectNext(pipelineResponse)
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe emitir AccessDeniedException si el usuario no es propietario")
        void shouldEmitErrorWhenNotOwner() {
            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));
            when(userRepository.findByUsername("student_two")).thenReturn(Optional.of(otherUser));

            StepVerifier.create(pipelineService.getPipelinesByWorkspace(10L, "student_two"))
                    .expectError(AccessDeniedException.class)
                    .verify();

            verify(pipelineRepository, never()).findByWorkspace_IdWorkspace(any());
        }

        @Test
        @DisplayName("Debe permitir lectura global de pipelines cuando el usuario es administrador")
        void shouldAllowAdminToReadAnyWorkspacePipelines() {
            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));
            when(userRepository.findByUsername("admin_root")).thenReturn(Optional.of(adminUser));
            when(pipelineRepository.findByWorkspace_IdWorkspace(10L)).thenReturn(List.of(pipeline));
            when(pipelineMapper.toResponse(pipeline)).thenReturn(pipelineResponse);

            StepVerifier.create(pipelineService.getPipelinesByWorkspace(10L, "admin_root"))
                    .expectNext(pipelineResponse)
                    .verifyComplete();
        }
    }

    @Nested
    @DisplayName("createPipeline()")
    class CreatePipeline {

        @Test
        @DisplayName("Debe crear pipeline en estado DRAFT por defecto")
        void shouldCreatePipelineWithDraftStatus() {
            PipelineRequest request = new PipelineRequest("Nuevo Pipeline");

            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));
            when(pipelineRepository.save(any(Pipeline.class))).thenReturn(pipeline);
            when(pipelineMapper.toResponse(pipeline)).thenReturn(pipelineResponse);

            StepVerifier.create(pipelineService.createPipeline(10L, request, "student_one"))
                    .expectNextMatches(r -> r.status() == PipelineStatus.DRAFT)
                    .verifyComplete();

            verify(pipelineRepository).save(argThat(p ->
                    p.getStatus() == PipelineStatus.DRAFT &&
                            p.getWorkspace().equals(workspace)
            ));
        }

        @Test
        @DisplayName("Debe emitir AccessDeniedException si el usuario no es propietario")
        void shouldEmitErrorWhenNotOwner() {
            PipelineRequest request = new PipelineRequest("Nuevo Pipeline");
            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));
            when(userRepository.findByUsername("student_two")).thenReturn(Optional.of(otherUser));

            StepVerifier.create(pipelineService.createPipeline(10L, request, "student_two"))
                    .expectError(AccessDeniedException.class)
                    .verify();

            verify(pipelineRepository, never()).save(any());
        }

        @Test
        @DisplayName("Debe emitir error si el workspace no existe")
        void shouldEmitErrorWhenWorkspaceNotFound() {
            PipelineRequest request = new PipelineRequest("Nuevo Pipeline");
            when(workspaceRepository.findById(99L)).thenReturn(Optional.empty());

            StepVerifier.create(pipelineService.createPipeline(99L, request, "student_one"))
                    .expectError(ResourceNotFoundException.class)
                    .verify();
        }

        @Test
        @DisplayName("Debe permitir crear pipelines en workspaces ajenos cuando el usuario es administrador")
        void shouldAllowAdminToCreatePipelineInAnyWorkspace() {
            PipelineRequest request = new PipelineRequest("Nuevo Pipeline");

            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));
            when(userRepository.findByUsername("admin_root")).thenReturn(Optional.of(adminUser));
            when(pipelineRepository.save(any(Pipeline.class))).thenReturn(pipeline);
            when(pipelineMapper.toResponse(pipeline)).thenReturn(pipelineResponse);

            StepVerifier.create(pipelineService.createPipeline(10L, request, "admin_root"))
                    .expectNext(pipelineResponse)
                    .verifyComplete();
        }
    }

    @Nested
    @DisplayName("deletePipeline()")
    class DeletePipeline {

        @Test
        @DisplayName("Debe eliminar el pipeline si el usuario es propietario")
        void shouldDeletePipelineForOwner() {
            when(pipelineRepository.findById(100L)).thenReturn(Optional.of(pipeline));

            StepVerifier.create(pipelineService.deletePipeline(100L, "student_one"))
                    .verifyComplete();

            verify(pipelineRepository).delete(pipeline);
        }

        @Test
        @DisplayName("Debe emitir AccessDeniedException si el usuario no es propietario")
        void shouldEmitErrorWhenNotOwner() {
            when(pipelineRepository.findById(100L)).thenReturn(Optional.of(pipeline));
            when(userRepository.findByUsername("student_two")).thenReturn(Optional.of(otherUser));

            StepVerifier.create(pipelineService.deletePipeline(100L, "student_two"))
                    .expectError(AccessDeniedException.class)
                    .verify();

            verify(pipelineRepository, never()).delete(any());
        }
    }

    @Nested
    @DisplayName("renamePipeline()")
    class RenamePipeline {

        @Test
        @DisplayName("Debe renombrar el pipeline si el usuario es propietario")
        void shouldRenamePipelineForOwner() {
            PipelineRequest request = new PipelineRequest("Pipeline Renombrado");

            when(pipelineRepository.findById(100L)).thenReturn(Optional.of(pipeline));
            when(pipelineRepository.save(any())).thenReturn(pipeline);
            when(pipelineMapper.toResponse(pipeline)).thenReturn(pipelineResponse);

            StepVerifier.create(pipelineService.renamePipeline(100L, request, "student_one"))
                    .expectNext(pipelineResponse)
                    .verifyComplete();

            verify(pipelineRepository).save(argThat(p ->
                    p.getName().equals("Pipeline Renombrado")));
        }
    }
}
