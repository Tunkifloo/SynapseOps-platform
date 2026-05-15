package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.request.PasswordUpdateRequest;
import com.synapseops.orchestrator.domain.dto.request.UserUpdateRequest;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import com.synapseops.orchestrator.domain.entity.Admin;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.infra.exception.ResourceNotFoundException;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.mapper.UserMapper;
import com.synapseops.orchestrator.service.impl.UserServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.crypto.password.PasswordEncoder;
import reactor.core.publisher.Flux;
import reactor.test.StepVerifier;

import java.util.List;
import java.util.Optional;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("UserServiceImpl — Tests unitarios")
class UserServiceImplTest {

    @Mock UserRepository  userRepository;
    @Mock UserMapper      userMapper;
    @Mock PasswordEncoder passwordEncoder;

    @InjectMocks UserServiceImpl userService;

    private User testUser;
    private UserResponse testUserResponse;

    @BeforeEach
    void setUp() {
        testUser = new Admin();
        testUser.setIdUser(1L);
        testUser.setUsername("admin_test");
        testUser.setPassword("encoded_password");
        testUser.setEmail("admin@test.com");
        testUser.setRole(Role.ADMIN);
        testUser.setEnabled(true);

        testUserResponse = new UserResponse(
                1L, "admin_test", "Admin", "admin@test.com",
                Role.ADMIN, "Apellido", "Materno", "999999999", true, null, null
        );
    }

    @Nested
    @DisplayName("getAllUsers()")
    class GetAllUsers {

        @Test
        @DisplayName("Debe retornar Flux con todos los usuarios activos")
        void shouldReturnAllEnabledUsers() {
            when(userRepository.findByEnabledTrue()).thenReturn(List.of(testUser));
            when(userMapper.toResponse(testUser)).thenReturn(testUserResponse);

            Flux<UserResponse> result = userService.getAllUsers();

            StepVerifier.create(result)
                    .expectNext(testUserResponse)
                    .verifyComplete();

            verify(userRepository).findByEnabledTrue();
        }

        @Test
        @DisplayName("Debe retornar Flux vacío si no hay usuarios activos")
        void shouldReturnEmptyFluxWhenNoUsers() {
            when(userRepository.findByEnabledTrue()).thenReturn(List.of());

            StepVerifier.create(userService.getAllUsers())
                    .verifyComplete();
        }
    }

    @Nested
    @DisplayName("getUserById()")
    class GetUserById {

        @Test
        @DisplayName("Debe retornar el usuario cuando existe y está activo")
        void shouldReturnUserWhenExists() {
            when(userRepository.findByIdUserAndEnabledTrue(1L)).thenReturn(Optional.of(testUser));
            when(userMapper.toResponse(testUser)).thenReturn(testUserResponse);

            StepVerifier.create(userService.getUserById(1L))
                    .expectNext(testUserResponse)
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe emitir error cuando el usuario no existe")
        void shouldEmitErrorWhenUserNotFound() {
            when(userRepository.findByIdUserAndEnabledTrue(99L)).thenReturn(Optional.empty());

            StepVerifier.create(userService.getUserById(99L))
                    .expectError(ResourceNotFoundException.class)
                    .verify();
        }
    }

    @Nested
    @DisplayName("toggleUserStatus()")
    class ToggleUserStatus {

        @Test
        @DisplayName("Debe deshabilitar un usuario activo")
        void shouldDisableEnabledUser() {
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.save(testUser)).thenReturn(testUser);

            StepVerifier.create(userService.toggleUserStatus(1L))
                    .verifyComplete();

            verify(userRepository).save(argThat(u -> !u.isEnabled()));
        }

        @Test
        @DisplayName("Debe habilitar un usuario deshabilitado")
        void shouldEnableDisabledUser() {
            testUser.setEnabled(false);
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.save(testUser)).thenReturn(testUser);

            StepVerifier.create(userService.toggleUserStatus(1L))
                    .verifyComplete();

            verify(userRepository).save(argThat(User::isEnabled));
        }

        @Test
        @DisplayName("Debe emitir error si el usuario no existe")
        void shouldEmitErrorWhenUserNotFound() {
            when(userRepository.findById(99L)).thenReturn(Optional.empty());

            StepVerifier.create(userService.toggleUserStatus(99L))
                    .expectError(ResourceNotFoundException.class)
                    .verify();
        }
    }

    @Nested
    @DisplayName("updatePassword()")
    class UpdatePassword {

        @Test
        @DisplayName("Debe actualizar la contraseña cuando los datos son correctos")
        void shouldUpdatePasswordSuccessfully() {
            PasswordUpdateRequest request = new PasswordUpdateRequest("oldPass", "newPass123!");

            when(userRepository.findByUsername("admin_test")).thenReturn(Optional.of(testUser));
            when(passwordEncoder.matches("oldPass", "encoded_password")).thenReturn(true);
            when(passwordEncoder.matches("newPass123!", "encoded_password")).thenReturn(false);
            when(passwordEncoder.encode("newPass123!")).thenReturn("new_encoded");
            when(userRepository.save(any())).thenReturn(testUser);

            StepVerifier.create(userService.updatePassword("admin_test", request))
                    .verifyComplete();

            verify(userRepository).save(argThat(u -> u.getPassword().equals("new_encoded")));
        }

        @Test
        @DisplayName("Debe emitir error si la contraseña actual es incorrecta")
        void shouldEmitErrorWhenCurrentPasswordWrong() {
            PasswordUpdateRequest request = new PasswordUpdateRequest("wrongPass", "newPass123!");

            when(userRepository.findByUsername("admin_test")).thenReturn(Optional.of(testUser));
            when(passwordEncoder.matches("wrongPass", "encoded_password")).thenReturn(false);

            StepVerifier.create(userService.updatePassword("admin_test", request))
                    .expectErrorMatches(ex ->
                            ex instanceof IllegalArgumentException &&
                                    ex.getMessage().contains("incorrecta"))
                    .verify();
        }

        @Test
        @DisplayName("Debe emitir error si la nueva contraseña es igual a la actual")
        void shouldEmitErrorWhenNewPasswordSameAsCurrent() {
            PasswordUpdateRequest request = new PasswordUpdateRequest("samePass", "samePass");

            when(userRepository.findByUsername("admin_test")).thenReturn(Optional.of(testUser));
            when(passwordEncoder.matches("samePass", "encoded_password")).thenReturn(true);

            StepVerifier.create(userService.updatePassword("admin_test", request))
                    .expectErrorMatches(ex ->
                            ex instanceof IllegalArgumentException &&
                                    ex.getMessage().contains("igual"))
                    .verify();
        }

        @Test
        @DisplayName("Debe emitir DisabledException si la cuenta está deshabilitada")
        void shouldEmitErrorWhenAccountDisabled() {
            testUser.setEnabled(false);
            PasswordUpdateRequest request = new PasswordUpdateRequest("oldPass", "newPass123!");

            when(userRepository.findByUsername("admin_test")).thenReturn(Optional.of(testUser));

            StepVerifier.create(userService.updatePassword("admin_test", request))
                    .expectError(DisabledException.class)
                    .verify();
        }
    }

    @Nested
    @DisplayName("updateUserByAdmin()")
    class UpdateUserByAdmin {

        @Test
        @DisplayName("Debe actualizar usuario cuando el email no está en uso")
        void shouldUpdateUserSuccessfully() {
            UserUpdateRequest request = new UserUpdateRequest(
                    "Nuevo1",
                    "Apellido1",
                    "Materno1",
                    "12345671",
                    "new1@email.com",
                    "987654327",
                    Role.ADMIN
            );
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.existsByEmail("new1@email.com")).thenReturn(false);
            when(userRepository.save(testUser)).thenReturn(testUser);
            when(userMapper.toResponse(testUser)).thenReturn(testUserResponse);

            StepVerifier.create(userService.updateUserByAdmin(1L, request))
                    .expectNext(testUserResponse)
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe emitir error si el email ya está en uso por otro usuario")
        void shouldEmitErrorWhenEmailAlreadyUsed() {
            UserUpdateRequest request = new UserUpdateRequest(
                    "Nuevo2",
                    "Apellido2",
                    "Materno3",
                    "12345674",
                    "new2@email.com",
                    "987654322",
                    Role.COLLABORATOR
            );
            when(userRepository.findById(1L)).thenReturn(Optional.of(testUser));
            when(userRepository.existsByEmail("new2@email.com")).thenReturn(true);

            StepVerifier.create(userService.updateUserByAdmin(1L, request))
                    .expectErrorMatches(ex ->
                            ex instanceof IllegalArgumentException &&
                                    ex.getMessage().contains("new2@email.com"))
                    .verify();
        }
    }
}
