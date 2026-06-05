package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.domain.dto.request.ForgotPasswordRequest;
import com.synapseops.orchestrator.domain.dto.request.LoginRequest;
import com.synapseops.orchestrator.domain.dto.request.UserRegistrationRequest;
import com.synapseops.orchestrator.domain.dto.response.TokenResponse;
import com.synapseops.orchestrator.domain.dto.response.UserResponse;
import com.synapseops.orchestrator.domain.entity.Admin;
import com.synapseops.orchestrator.domain.entity.Collaborator;
import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.infra.exception.AccountLockedException;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.infra.security.JwtService;
import com.synapseops.orchestrator.mapper.UserMapper;
import com.synapseops.orchestrator.service.auth.AuthServiceImpl;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.authentication.DisabledException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.transaction.support.TransactionTemplate;
import reactor.test.StepVerifier;

import java.util.Optional;
import java.util.function.Consumer;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("AuthServiceImpl — Tests unitarios")
class AuthServiceImplTest {

    @Mock UserRepository userRepository;
    @Mock JwtService jwtService;
    @Mock PasswordEncoder passwordEncoder;
    @Mock UserFactory userFactory;
    @Mock UserMapper userMapper;
    @Mock TransactionTemplate transactionTemplate;

    @InjectMocks AuthServiceImpl authService;

    private Collaborator collaborator;

    @BeforeEach
    void setUp() {
        collaborator = new Collaborator();
        collaborator.setIdUser(5L);
        collaborator.setUsername("student_one");
        collaborator.setPassword("encoded");
        collaborator.setEmail("student@upao.edu.pe");
        collaborator.setRole(Role.COLLABORATOR);
        collaborator.setStudentCode("0201910001");
        collaborator.setEnabled(true);
    }

    @Nested
    @DisplayName("login()")
    class Login {

        @Test
        @DisplayName("Credenciales válidas → retorna token JWT")
        void shouldReturnTokenOnValidCredentials() {
            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(collaborator));
            when(passwordEncoder.matches("secret", "encoded")).thenReturn(true);
            when(jwtService.getToken(collaborator)).thenReturn("jwt-token");

            StepVerifier.create(authService.login(new LoginRequest("student_one", "secret")))
                    .expectNext(new TokenResponse("jwt-token"))
                    .verifyComplete();
        }

        @Test
        @DisplayName("Usuario inexistente → BadCredentials (no contabiliza intentos)")
        void shouldFailForNonExistentUser() {
            when(userRepository.findByUsername("ghost")).thenReturn(Optional.empty());

            StepVerifier.create(authService.login(new LoginRequest("ghost", "x")))
                    .expectError(BadCredentialsException.class)
                    .verify();
        }

        @Test
        @DisplayName("Cuenta deshabilitada → DisabledException")
        void shouldFailForDisabledAccount() {
            collaborator.setEnabled(false);
            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(collaborator));

            StepVerifier.create(authService.login(new LoginRequest("student_one", "secret")))
                    .expectError(DisabledException.class)
                    .verify();
        }

        @Test
        @DisplayName("Bloqueo tras 3 intentos fallidos → AccountLockedException")
        void shouldLockAccountAfterThreeFailures() {
            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(collaborator));
            when(passwordEncoder.matches("bad", "encoded")).thenReturn(false);

            LoginRequest bad = new LoginRequest("student_one", "bad");

            StepVerifier.create(authService.login(bad)).expectError(BadCredentialsException.class).verify();
            StepVerifier.create(authService.login(bad)).expectError(BadCredentialsException.class).verify();
            // 3er intento → bloqueo
            StepVerifier.create(authService.login(bad)).expectError(AccountLockedException.class).verify();
        }
    }

    @Nested
    @DisplayName("register()")
    class Register {

        @Test
        @DisplayName("Datos válidos → retorna UserResponse (sin token)")
        void shouldReturnUserResponse() {
            var request = new UserRegistrationRequest(
                    "new_student", "password1", "Nombre", "Paterno", "Materno",
                    "new@upao.edu.pe", "987654321", Role.COLLABORATOR, "0201910099", "Ing. Sistemas");
            var created = new Collaborator();
            var response = new UserResponse(9L, "new_student", "Nombre", "new@upao.edu.pe",
                    Role.COLLABORATOR, "Paterno", "Materno", "987654321", true, "0201910099", "Ing. Sistemas");

            when(userRepository.existsByUsername("new_student")).thenReturn(false);
            when(userRepository.existsByEmail("new@upao.edu.pe")).thenReturn(false);
            when(userFactory.createUser(Role.COLLABORATOR)).thenReturn(created);
            when(passwordEncoder.encode("password1")).thenReturn("enc");
            when(userRepository.save(created)).thenReturn(created);
            when(userMapper.toResponse(created)).thenReturn(response);

            StepVerifier.create(authService.register(request))
                    .expectNext(response)
                    .verifyComplete();

            verify(jwtService, never()).getToken(any());
        }

        @Test
        @DisplayName("Username duplicado → IllegalArgumentException")
        void shouldFailOnDuplicateUsername() {
            var request = new UserRegistrationRequest(
                    "dup", "password1", "N", "P", "M", "a@b.pe", "987654321",
                    Role.COLLABORATOR, "0201910099", "Ing.");
            when(userRepository.existsByUsername("dup")).thenReturn(true);

            StepVerifier.create(authService.register(request))
                    .expectError(IllegalArgumentException.class)
                    .verify();
        }

        @Test
        @DisplayName("Colaborador sin código de estudiante → IllegalArgumentException")
        void shouldFailWhenCollaboratorMissingStudentCode() {
            var request = new UserRegistrationRequest(
                    "stud", "password1", "N", "P", "M", "a@b.pe", "987654321",
                    Role.COLLABORATOR, null, "Ing.");
            when(userRepository.existsByUsername("stud")).thenReturn(false);
            when(userRepository.existsByEmail("a@b.pe")).thenReturn(false);

            StepVerifier.create(authService.register(request))
                    .expectError(IllegalArgumentException.class)
                    .verify();
        }
    }

    @Nested
    @DisplayName("forgotPassword()")
    class ForgotPassword {

        @SuppressWarnings("unchecked")
        private void runInTransaction() {
            doAnswer(inv -> {
                Consumer<Object> c = inv.getArgument(0);
                c.accept(null);
                return null;
            }).when(transactionTemplate).executeWithoutResult(any());
        }

        @Test
        @DisplayName("Identidad válida (email + studentCode) → restablece contraseña")
        void shouldResetPasswordWhenIdentityMatches() {
            runInTransaction();
            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(collaborator));
            when(passwordEncoder.matches("nueva123", "encoded")).thenReturn(false);
            when(passwordEncoder.encode("nueva123")).thenReturn("enc-nueva");

            var req = new ForgotPasswordRequest(
                    "student_one", "student@upao.edu.pe", "0201910001", "nueva123");

            StepVerifier.create(authService.forgotPassword(req)).verifyComplete();
            verify(userRepository).updatePasswordDirect("student_one", "enc-nueva");
        }

        @Test
        @DisplayName("Email no coincide → IllegalArgumentException, no resetea")
        void shouldFailWhenEmailMismatch() {
            runInTransaction();
            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(collaborator));

            var req = new ForgotPasswordRequest(
                    "student_one", "otro@upao.edu.pe", "0201910001", "nueva123");

            StepVerifier.create(authService.forgotPassword(req))
                    .expectError(IllegalArgumentException.class)
                    .verify();
            verify(userRepository, never()).updatePasswordDirect(any(), any());
        }

        @Test
        @DisplayName("studentCode no coincide → IllegalArgumentException")
        void shouldFailWhenStudentCodeMismatch() {
            runInTransaction();
            when(userRepository.findByUsername("student_one")).thenReturn(Optional.of(collaborator));

            var req = new ForgotPasswordRequest(
                    "student_one", "student@upao.edu.pe", "9999999999", "nueva123");

            StepVerifier.create(authService.forgotPassword(req))
                    .expectError(IllegalArgumentException.class)
                    .verify();
            verify(userRepository, never()).updatePasswordDirect(any(), any());
        }
    }
}
