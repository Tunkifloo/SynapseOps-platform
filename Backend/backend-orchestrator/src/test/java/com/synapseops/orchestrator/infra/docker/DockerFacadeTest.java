package com.synapseops.orchestrator.infra.docker;

import com.github.dockerjava.api.DockerClient;
import com.github.dockerjava.api.command.*;
import com.github.dockerjava.api.model.Frame;
import com.github.dockerjava.api.model.StreamType;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.*;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("DockerFacade — Tests unitarios")
class DockerFacadeTest {

    @Mock DockerClient dockerClient;
    @Mock SseEmitter   sseEmitter;

    @InjectMocks DockerFacade dockerFacade;

    @Nested
    @DisplayName("buildImage()")
    class BuildImage {

        @Test
        @DisplayName("Debe retornar el imageId tras construir la imagen exitosamente")
        void shouldReturnImageIdOnSuccess() {
            BuildImageCmd         buildCmd      = mock(BuildImageCmd.class);
            BuildImageResultCallback callback  = mock(BuildImageResultCallback.class);

            when(dockerClient.buildImageCmd(any(java.io.InputStream.class)))
                    .thenReturn(buildCmd);
            when(buildCmd.withTags(anySet())).thenReturn(buildCmd);
            when(buildCmd.exec(any(BuildImageResultCallback.class)))
                    .thenReturn(callback);
            when(callback.awaitImageId()).thenReturn("sha256:abc123");

            String result = dockerFacade.buildImage("FROM python:3.11", "model-service");

            assertThat(result).isEqualTo("sha256:abc123");
            verify(buildCmd).withTags(argThat(tags -> tags.contains("model-service:latest")));
        }
    }

    @Nested
    @DisplayName("runContainer()")
    class RunContainer {

        @Test
        @DisplayName("Debe retornar el containerId tras levantar el contenedor")
        void shouldReturnContainerIdOnSuccess() {
            CreateContainerCmd      createCmd  = mock(CreateContainerCmd.class);
            CreateContainerResponse createResp = mock(CreateContainerResponse.class);
            StartContainerCmd       startCmd   = mock(StartContainerCmd.class);

            when(dockerClient.createContainerCmd("sha256:abc123")).thenReturn(createCmd);
            when(createCmd.withEnv(anyList())).thenReturn(createCmd);
            when(createCmd.withHostConfig(any())).thenReturn(createCmd);
            when(createCmd.exec()).thenReturn(createResp);
            when(createResp.getId()).thenReturn("container-xyz");
            when(dockerClient.startContainerCmd("container-xyz")).thenReturn(startCmd);

            String result = dockerFacade.runContainer(
                    "sha256:abc123",
                    Map.of("MODEL_PATH", "/mlflow/artifacts/model.h5"));

            assertThat(result).isEqualTo("container-xyz");
            verify(dockerClient).startContainerCmd("container-xyz");
            verify(startCmd).exec();
        }

        @Test
        @DisplayName("Debe convertir el mapa de env vars al formato KEY=VALUE")
        void shouldConvertEnvMapToKeyValueFormat() {
            CreateContainerCmd      createCmd  = mock(CreateContainerCmd.class);
            CreateContainerResponse createResp = mock(CreateContainerResponse.class);
            StartContainerCmd       startCmd   = mock(StartContainerCmd.class);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<String>> envCaptor = ArgumentCaptor.forClass(List.class);

            when(dockerClient.createContainerCmd(any())).thenReturn(createCmd);
            when(createCmd.withEnv(anyList())).thenReturn(createCmd);
            when(createCmd.withHostConfig(any())).thenReturn(createCmd);
            when(createCmd.exec()).thenReturn(createResp);
            when(createResp.getId()).thenReturn("container-abc");
            when(dockerClient.startContainerCmd(any())).thenReturn(startCmd);

            dockerFacade.runContainer("image-id",
                    Map.of("KEY1", "VALUE1", "KEY2", "VALUE2"));

            verify(createCmd).withEnv(envCaptor.capture());
            List<String> capturedEnv = envCaptor.getValue();

            assertThat(capturedEnv)
                    .hasSize(2)
                    .contains("KEY1=VALUE1", "KEY2=VALUE2");
        }
    }

    @Nested
    @DisplayName("stopContainer()")
    class StopContainer {

        @Test
        @DisplayName("Debe detener y eliminar el contenedor exitosamente")
        void shouldStopAndRemoveContainer() {
            StopContainerCmd   stopCmd   = mock(StopContainerCmd.class);
            RemoveContainerCmd removeCmd = mock(RemoveContainerCmd.class);

            when(dockerClient.stopContainerCmd("container-xyz")).thenReturn(stopCmd);
            when(stopCmd.withTimeout(10)).thenReturn(stopCmd);
            when(dockerClient.removeContainerCmd("container-xyz")).thenReturn(removeCmd);
            when(removeCmd.withForce(true)).thenReturn(removeCmd);

            dockerFacade.stopContainer("container-xyz");

            verify(stopCmd).exec();
            verify(removeCmd).exec();
        }

        @Test
        @DisplayName("Debe completar sin lanzar excepción si el contenedor no existe")
        void shouldNotThrowWhenContainerNotFound() {
            StopContainerCmd stopCmd = mock(StopContainerCmd.class);

            when(dockerClient.stopContainerCmd("nonexistent")).thenReturn(stopCmd);
            when(stopCmd.withTimeout(10)).thenReturn(stopCmd);
            when(stopCmd.exec()).thenThrow(
                    new RuntimeException("No such container"));

            org.junit.jupiter.api.Assertions.assertDoesNotThrow(
                    () -> dockerFacade.stopContainer("nonexistent"));
        }
    }

    @Nested
    @DisplayName("healthCheck()")
    class HealthCheck {

        @Test
        @DisplayName("Debe retornar true cuando el contenedor está running")
        void shouldReturnTrueWhenRunning() {
            InspectContainerCmd      inspectCmd  = mock(InspectContainerCmd.class);
            InspectContainerResponse inspectResp = mock(InspectContainerResponse.class);
            InspectContainerResponse.ContainerState state =
                    mock(InspectContainerResponse.ContainerState.class);

            when(dockerClient.inspectContainerCmd("container-xyz")).thenReturn(inspectCmd);
            when(inspectCmd.exec()).thenReturn(inspectResp);
            when(inspectResp.getState()).thenReturn(state);
            when(state.getRunning()).thenReturn(true);

            assertThat(dockerFacade.healthCheck("container-xyz")).isTrue();
        }

        @Test
        @DisplayName("Debe retornar false cuando el contenedor está detenido")
        void shouldReturnFalseWhenStopped() {
            InspectContainerCmd      inspectCmd  = mock(InspectContainerCmd.class);
            InspectContainerResponse inspectResp = mock(InspectContainerResponse.class);
            InspectContainerResponse.ContainerState state =
                    mock(InspectContainerResponse.ContainerState.class);

            when(dockerClient.inspectContainerCmd("container-xyz")).thenReturn(inspectCmd);
            when(inspectCmd.exec()).thenReturn(inspectResp);
            when(inspectResp.getState()).thenReturn(state);
            when(state.getRunning()).thenReturn(false);

            assertThat(dockerFacade.healthCheck("container-xyz")).isFalse();
        }

        @Test
        @DisplayName("Debe retornar false cuando el Docker Engine no responde")
        void shouldReturnFalseWhenDockerEngineUnreachable() {
            InspectContainerCmd inspectCmd = mock(InspectContainerCmd.class);

            when(dockerClient.inspectContainerCmd("container-xyz")).thenReturn(inspectCmd);
            when(inspectCmd.exec()).thenThrow(new RuntimeException("Connection refused"));

            assertThat(dockerFacade.healthCheck("container-xyz")).isFalse();
        }
    }

    @Nested
    @DisplayName("streamContainerLogs()")
    class StreamContainerLogs {

        @Test
        @DisplayName("Debe invocar logContainerCmd con los flags correctos")
        void shouldInvokeLogContainerCmdWithCorrectFlags() {
            LogContainerCmd logCmd = mock(LogContainerCmd.class);

            when(dockerClient.logContainerCmd("container-xyz")).thenReturn(logCmd);
            when(logCmd.withFollowStream(true)).thenReturn(logCmd);
            when(logCmd.withStdOut(true)).thenReturn(logCmd);
            when(logCmd.withStdErr(true)).thenReturn(logCmd);
            when(logCmd.withTimestamps(true)).thenReturn(logCmd);
            when(logCmd.exec(any())).thenReturn(mock(
                    com.github.dockerjava.api.async.ResultCallback.Adapter.class));

            dockerFacade.streamContainerLogs("container-xyz", sseEmitter);

            verify(logCmd).withFollowStream(true);
            verify(logCmd).withStdOut(true);
            verify(logCmd).withStdErr(true);
            verify(logCmd).withTimestamps(true);
        }

        @Test
        @DisplayName("Debe enviar frame de log al SseEmitter correctamente")
        void shouldSendLogFrameToSseEmitter() throws Exception {
            byte[] payload = "[INFO] Epoch 1/50 — accuracy: 0.72".getBytes();
            Frame frame = new Frame(StreamType.STDOUT, payload);

            LogContainerCmd logCmd = mock(LogContainerCmd.class);
            when(dockerClient.logContainerCmd("container-xyz")).thenReturn(logCmd);
            when(logCmd.withFollowStream(true)).thenReturn(logCmd);
            when(logCmd.withStdOut(true)).thenReturn(logCmd);
            when(logCmd.withStdErr(true)).thenReturn(logCmd);
            when(logCmd.withTimestamps(true)).thenReturn(logCmd);

            ArgumentCaptor<com.github.dockerjava.api.async.ResultCallback.Adapter<Frame>>
                    callbackCaptor = ArgumentCaptor.forClass(
                    com.github.dockerjava.api.async.ResultCallback.Adapter.class);
            when(logCmd.exec(callbackCaptor.capture())).thenReturn(null);

            dockerFacade.streamContainerLogs("container-xyz", sseEmitter);

            callbackCaptor.getValue().onNext(frame);

            verify(sseEmitter).send(any(SseEmitter.SseEventBuilder.class));
        }

        @Test
        @DisplayName("Debe llamar emitter.complete() cuando el stream termina")
        void shouldCompleteEmitterWhenStreamEnds() {
            LogContainerCmd logCmd = mock(LogContainerCmd.class);
            when(dockerClient.logContainerCmd("container-xyz")).thenReturn(logCmd);
            when(logCmd.withFollowStream(true)).thenReturn(logCmd);
            when(logCmd.withStdOut(true)).thenReturn(logCmd);
            when(logCmd.withStdErr(true)).thenReturn(logCmd);
            when(logCmd.withTimestamps(true)).thenReturn(logCmd);

            ArgumentCaptor<com.github.dockerjava.api.async.ResultCallback.Adapter<Frame>>
                    callbackCaptor = ArgumentCaptor.forClass(
                    com.github.dockerjava.api.async.ResultCallback.Adapter.class);
            when(logCmd.exec(callbackCaptor.capture())).thenReturn(null);

            dockerFacade.streamContainerLogs("container-xyz", sseEmitter);
            callbackCaptor.getValue().onComplete();

            verify(sseEmitter).complete();
        }
    }
}
