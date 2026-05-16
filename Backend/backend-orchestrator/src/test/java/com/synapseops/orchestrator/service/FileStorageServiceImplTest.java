package com.synapseops.orchestrator.service;

import com.synapseops.orchestrator.config.StorageProperties;
import com.synapseops.orchestrator.service.impl.FileStorageServiceImpl;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import static org.mockito.Mockito.lenient;
import org.springframework.http.HttpHeaders;
import org.springframework.http.codec.multipart.FilePart;
import reactor.core.publisher.Mono;
import reactor.test.StepVerifier;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("FileStorageServiceImpl — Tests unitarios")
class FileStorageServiceImplTest {

    @TempDir
    Path tempDir;

    @Mock StorageProperties storageProperties;
    @Mock FilePart          filePart;
    @Mock HttpHeaders       fileHeaders;

    @InjectMocks FileStorageServiceImpl storageService;

    private static final Long USER_ID      = 1L;
    private static final Long WORKSPACE_ID = 10L;

    @BeforeEach
    void setUp() {
        lenient().when(storageProperties.getBasePath()).thenReturn(tempDir.toString());
    }

    @Nested
    @DisplayName("store()")
    class Store {

        @Test
        @DisplayName("Debe almacenar un archivo CSV válido y retornar la ruta absoluta")
        void shouldStoreCsvFileSuccessfully() {
            when(storageProperties.getMaxFileSizeMb()).thenReturn(500L);
            when(filePart.filename()).thenReturn("dataset.csv");
            when(filePart.headers()).thenReturn(fileHeaders);
            when(fileHeaders.getContentLength()).thenReturn(1024L);
            when(filePart.transferTo(any(Path.class))).thenReturn(Mono.empty());

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .assertNext(path -> {
                        assertThat(path).contains("dataset.csv");
                        assertThat(path).contains(USER_ID.toString());
                        assertThat(path).contains(WORKSPACE_ID.toString());
                        assertThat(path).contains("datasets");
                    })
                    .verifyComplete();

            verify(filePart).transferTo(any(Path.class));
        }

        @Test
        @DisplayName("Debe almacenar un archivo PNG válido")
        void shouldStorePngFileSuccessfully() {
            when(storageProperties.getMaxFileSizeMb()).thenReturn(500L);
            when(filePart.filename()).thenReturn("imagen.png");
            when(filePart.headers()).thenReturn(fileHeaders);
            when(fileHeaders.getContentLength()).thenReturn(2048L);
            when(filePart.transferTo(any(Path.class))).thenReturn(Mono.empty());

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .assertNext(path -> assertThat(path).contains("imagen.png"))
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe almacenar un archivo JPEG válido")
        void shouldStoreJpegFileSuccessfully() {
            when(storageProperties.getMaxFileSizeMb()).thenReturn(500L);
            when(filePart.filename()).thenReturn("foto.jpeg");
            when(filePart.headers()).thenReturn(fileHeaders);
            when(fileHeaders.getContentLength()).thenReturn(2048L);
            when(filePart.transferTo(any(Path.class))).thenReturn(Mono.empty());

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .assertNext(path -> assertThat(path).contains("foto.jpeg"))
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe emitir error si el tipo de archivo no está permitido")
        void shouldEmitErrorForInvalidFileType() {
            when(filePart.filename()).thenReturn("modelo.h5");

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .expectErrorMatches(ex ->
                            ex instanceof IllegalArgumentException &&
                                    ex.getMessage().contains("Tipo de archivo no permitido"))
                    .verify();

            verify(filePart, never()).transferTo(any(Path.class));
        }

        @Test
        @DisplayName("Debe emitir error para archivo .pkl (artefacto ML — fuera de alcance)")
        void shouldEmitErrorForPklFile() {
            when(filePart.filename()).thenReturn("model.pkl");

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .expectErrorMatches(ex ->
                            ex instanceof IllegalArgumentException &&
                                    ex.getMessage().contains("Tipo de archivo no permitido"))
                    .verify();

            verify(filePart, never()).transferTo(any(Path.class));
        }

        @Test
        @DisplayName("Debe emitir error si el archivo supera el tamaño máximo")
        void shouldEmitErrorWhenFileTooLarge() {
            long maxBytes = 500L * 1024 * 1024;

            when(storageProperties.getMaxFileSizeMb()).thenReturn(500L);
            when(filePart.filename()).thenReturn("dataset.csv");
            when(filePart.headers()).thenReturn(fileHeaders);
            when(fileHeaders.getContentLength()).thenReturn(maxBytes + 1);

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .expectErrorMatches(ex ->
                            ex instanceof IllegalArgumentException &&
                                    ex.getMessage().contains("500"))
                    .verify();

            verify(filePart, never()).transferTo(any(Path.class));
        }

        @Test
        @DisplayName("Debe permitir archivo justo en el límite de tamaño (500 MB exactos)")
        void shouldAllowFileAtSizeLimit() {
            long exactLimit = 500L * 1024 * 1024;

            when(storageProperties.getMaxFileSizeMb()).thenReturn(500L);
            when(filePart.filename()).thenReturn("dataset.csv");
            when(filePart.headers()).thenReturn(fileHeaders);
            when(fileHeaders.getContentLength()).thenReturn(exactLimit);
            when(filePart.transferTo(any(Path.class))).thenReturn(Mono.empty());

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .assertNext(path -> assertThat(path).isNotBlank())
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe crear los directorios intermedios si no existen")
        void shouldCreateDirectoriesIfNotExist() {
            when(storageProperties.getMaxFileSizeMb()).thenReturn(500L);
            when(filePart.filename()).thenReturn("data.csv");
            when(filePart.headers()).thenReturn(fileHeaders);
            when(fileHeaders.getContentLength()).thenReturn(512L);
            when(filePart.transferTo(any(Path.class))).thenReturn(Mono.empty());

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .assertNext(path -> {
                        Path expectedDir = tempDir
                                .resolve(USER_ID.toString())
                                .resolve(WORKSPACE_ID.toString())
                                .resolve("datasets");
                        assertThat(Files.exists(expectedDir)).isTrue();
                    })
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe sanitizar nombres con caracteres peligrosos (path traversal)")
        void shouldSanitizeFilenameWithDangerousCharacters() {
            when(storageProperties.getMaxFileSizeMb()).thenReturn(500L);
            when(filePart.filename()).thenReturn("../../etc/passwd.csv");
            when(filePart.headers()).thenReturn(fileHeaders);
            when(fileHeaders.getContentLength()).thenReturn(256L);
            when(filePart.transferTo(any(Path.class))).thenReturn(Mono.empty());

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .assertNext(path -> {
                        assertThat(path).doesNotContain("..");
                        assertThat(path).startsWith(tempDir.toString());
                    })
                    .verifyComplete();
        }

        @Test
        @DisplayName("No debe validar tamaño si Content-Length es -1 (desconocido)")
        void shouldSkipSizeValidationWhenContentLengthUnknown() {
            when(storageProperties.getMaxFileSizeMb()).thenReturn(500L);
            when(filePart.filename()).thenReturn("dataset.csv");
            when(filePart.headers()).thenReturn(fileHeaders);
            when(fileHeaders.getContentLength()).thenReturn(-1L);
            when(filePart.transferTo(any(Path.class))).thenReturn(Mono.empty());

            StepVerifier.create(storageService.store(filePart, USER_ID, WORKSPACE_ID))
                    .assertNext(path -> assertThat(path).isNotBlank())
                    .verifyComplete();
        }
    }

    @Nested
    @DisplayName("getPath()")
    class GetPath {

        @Test
        @DisplayName("Debe retornar la ruta absoluta cuando el archivo existe")
        void shouldReturnPathWhenFileExists() throws IOException {
            Path dir = tempDir
                    .resolve(USER_ID.toString())
                    .resolve(WORKSPACE_ID.toString())
                    .resolve("datasets");
            Files.createDirectories(dir);
            Files.createFile(dir.resolve("dataset.csv"));

            StepVerifier.create(storageService.getPath("dataset.csv", USER_ID, WORKSPACE_ID))
                    .assertNext(path -> {
                        assertThat(path).contains("dataset.csv");
                        assertThat(path).contains("datasets");
                    })
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe emitir error cuando el archivo no existe")
        void shouldEmitErrorWhenFileNotFound() {

            StepVerifier.create(
                            storageService.getPath("nonexistent.csv", USER_ID, WORKSPACE_ID))
                    .expectErrorMatches(ex ->
                            ex instanceof IllegalArgumentException &&
                                    ex.getMessage().contains("nonexistent.csv"))
                    .verify();
        }
    }

    @Nested
    @DisplayName("delete()")
    class Delete {

        @Test
        @DisplayName("Debe eliminar el archivo cuando existe")
        void shouldDeleteFileSuccessfully() throws IOException {
            Path dir = tempDir
                    .resolve(USER_ID.toString())
                    .resolve(WORKSPACE_ID.toString())
                    .resolve("datasets");
            Files.createDirectories(dir);
            Path file = dir.resolve("dataset.csv");
            Files.createFile(file);

            assertThat(Files.exists(file)).isTrue();

            StepVerifier.create(storageService.delete("dataset.csv", USER_ID, WORKSPACE_ID))
                    .verifyComplete();

            assertThat(Files.exists(file)).isFalse();
        }

        @Test
        @DisplayName("Debe completar sin error si el archivo no existe (idempotente)")
        void shouldCompleteWithoutErrorWhenFileNotFound() {
            StepVerifier.create(
                            storageService.delete("nonexistent.csv", USER_ID, WORKSPACE_ID))
                    .verifyComplete();
        }

        @Test
        @DisplayName("Debe aislar archivos por userId y workspaceId distintos")
        void shouldIsolateFilesByUserAndWorkspace() throws IOException {
            Long otherUserId = 99L;

            Path dir1 = tempDir
                    .resolve(USER_ID.toString())
                    .resolve(WORKSPACE_ID.toString())
                    .resolve("datasets");
            Files.createDirectories(dir1);
            Files.createFile(dir1.resolve("dataset.csv"));

            StepVerifier.create(
                            storageService.delete("dataset.csv", otherUserId, WORKSPACE_ID))
                    .verifyComplete();

            assertThat(Files.exists(dir1.resolve("dataset.csv"))).isTrue();
        }
    }
}
