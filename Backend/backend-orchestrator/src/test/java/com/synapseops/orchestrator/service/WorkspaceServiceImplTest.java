package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.request.WorkspaceRequest;
import com.synapseops.orchestrator.domain.dto.response.WorkspaceResponse;
import com.synapseops.orchestrator.domain.entity.Admin;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.domain.entity.Workspace;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.infra.repository.WorkspaceRepository;
import com.synapseops.orchestrator.mapper.WorkspaceMapper;
import com.synapseops.orchestrator.service.impl.WorkspaceServiceImpl;
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

import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("WorkspaceServiceImpl — Tests unitarios")
class WorkspaceServiceImplTest {

    @Mock WorkspaceRepository workspaceRepository;
    @Mock UserRepository      userRepository;
    @Mock WorkspaceMapper     workspaceMapper;

    @InjectMocks WorkspaceServiceImpl workspaceService;

    private User        owner;
    private User        otherUser;
    private Workspace   workspace;
    private WorkspaceResponse workspaceResponse;

    @BeforeEach
    void setUp() {
        owner = new Admin();
        owner.setIdUser(1L);
        owner.setUsername("student_one");
        owner.setRole(Role.COLLABORATOR);
        owner.setEnabled(true);

        otherUser = new Admin();
        otherUser.setIdUser(2L);
        otherUser.setUsername("student_two");
        otherUser.setEnabled(true);

        workspace = new Workspace();
        workspace.setIdWorkspace(10L);
        workspace.setName("Mi Proyecto ML");
        workspace.setDescription("Clasificación de imágenes");
        workspace.setCreatedAt(LocalDateTime.now());
        workspace.setUser(owner);

        workspaceResponse = new WorkspaceResponse(
                10L, "Mi Proyecto ML", "Clasificación de imágenes",
                workspace.getCreatedAt(), 1L, "student_one", "/data"
        );
    }

    @Nested
    @DisplayName("getMyWorkspaces()")
    class GetMyWorkspaces {

        @Test
        @DisplayName("Debe retornar los workspaces del usuario autenticado")
        void shouldReturnWorkspacesForAuthenticatedUser() {
            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(owner));
            when(workspaceRepository.findByUser_IdUserAndUser_EnabledTrue(1L))
                    .thenReturn(List.of(workspace));
            when(workspaceMapper.toResponse(workspace)).thenReturn(workspaceResponse);

            StepVerifier.create(workspaceService.getMyWorkspaces("student_one"))
                    .expectNext(workspaceResponse)
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe retornar Flux vacío si el usuario no tiene workspaces")
        void shouldReturnEmptyFluxWhenNoWorkspaces() {
            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(owner));
            when(workspaceRepository.findByUser_IdUserAndUser_EnabledTrue(1L))
                    .thenReturn(List.of());

            StepVerifier.create(workspaceService.getMyWorkspaces("student_one"))
                    .verifyComplete();
        }
    }

    @Nested
    @DisplayName("createWorkspace()")
    class CreateWorkspace {

        @Test
        @DisplayName("Debe crear el workspace cuando el nombre no está en uso")
        void shouldCreateWorkspaceSuccessfully() {
            WorkspaceRequest request = new WorkspaceRequest("Nuevo Proyecto", "Descripción");

            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(owner));
            when(workspaceRepository.existsByNameAndUser_IdUser("Nuevo Proyecto", 1L))
                    .thenReturn(false);
            when(workspaceRepository.save(any(Workspace.class))).thenReturn(workspace);
            when(workspaceMapper.toResponse(workspace)).thenReturn(workspaceResponse);

            StepVerifier.create(workspaceService.createWorkspace(request, "student_one"))
                    .expectNext(workspaceResponse)
                    .verifyComplete();

            verify(workspaceRepository).save(any(Workspace.class));
        }

        @Test
        @DisplayName("Debe emitir error si ya existe un workspace con ese nombre")
        void shouldEmitErrorWhenNameAlreadyExists() {
            WorkspaceRequest request = new WorkspaceRequest("Mi Proyecto ML", "Descripción");

            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(owner));
            when(workspaceRepository.existsByNameAndUser_IdUser("Mi Proyecto ML", 1L))
                    .thenReturn(true);

            StepVerifier.create(workspaceService.createWorkspace(request, "student_one"))
                    .expectErrorMatches(ex ->
                            ex instanceof IllegalArgumentException &&
                                    ex.getMessage().contains("Mi Proyecto ML"))
                    .verify();

            verify(workspaceRepository, never()).save(any());
        }
    }

    @Nested
    @DisplayName("getWorkspaceById()")
    class GetWorkspaceById {

        @Test
        @DisplayName("Debe retornar workspace cuando el usuario es propietario")
        void shouldReturnWorkspaceForOwner() {
            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));
            when(workspaceMapper.toResponse(workspace)).thenReturn(workspaceResponse);

            StepVerifier.create(workspaceService.getWorkspaceById(10L, "student_one"))
                    .expectNext(workspaceResponse)
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe emitir AccessDeniedException si el usuario no es propietario")
        void shouldEmitErrorWhenNotOwner() {
            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));

            StepVerifier.create(workspaceService.getWorkspaceById(10L, "student_two"))
                    .expectError(AccessDeniedException.class)
                    .verify();
        }

        @Test
        @DisplayName("Debe emitir error si el workspace no existe")
        void shouldEmitErrorWhenWorkspaceNotFound() {
            when(workspaceRepository.findById(99L)).thenReturn(Optional.empty());

            StepVerifier.create(workspaceService.getWorkspaceById(99L, "student_one"))
                    .expectError(ResourceNotFoundException.class)
                    .verify();
        }
    }

    @Nested
    @DisplayName("deleteWorkspace()")
    class DeleteWorkspace {

        @Test
        @DisplayName("Debe eliminar el workspace si el usuario es propietario")
        void shouldDeleteWorkspaceForOwner() {
            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));

            StepVerifier.create(workspaceService.deleteWorkspace(10L, "student_one"))
                    .verifyComplete();

            verify(workspaceRepository).delete(workspace);
        }

        @Test
        @DisplayName("Debe emitir AccessDeniedException si el usuario no es propietario")
        void shouldEmitErrorWhenNotOwner() {
            when(workspaceRepository.findById(10L)).thenReturn(Optional.of(workspace));

            StepVerifier.create(workspaceService.deleteWorkspace(10L, "student_two"))
                    .expectError(AccessDeniedException.class)
                    .verify();

            verify(workspaceRepository, never()).delete(any());
        }
    }
}
