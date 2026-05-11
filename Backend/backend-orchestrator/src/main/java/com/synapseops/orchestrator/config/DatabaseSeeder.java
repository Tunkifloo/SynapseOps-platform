package com.synapseops.orchestrator.config;

import com.synapseops.orchestrator.domain.entity.Role;
import com.synapseops.orchestrator.domain.entity.User;
import com.synapseops.orchestrator.infra.repository.UserRepository;
import com.synapseops.orchestrator.service.UserFactory;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;

@Slf4j
@Component
@RequiredArgsConstructor
public class DatabaseSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final UserFactory userFactory;

    @Value("${admin.default.username}")
    private String defaultUsername;

    @Value("${admin.default.password}")
    private String defaultPassword;

    @Value("${admin.default.email}")
    private String defaultEmail;

    @Override
    public void run(String... args) throws Exception {
        log.info("Verificando existencia de administrador inicial...");

        List<User> admins = userRepository.findByRoleAndEnabledTrue(Role.ADMIN);

        if (admins.isEmpty()) {
            log.info("No se encontraron administradores. Creando Super Admin por defecto...");

            User adminUser = userFactory.createUser(Role.ADMIN);
            adminUser.setUsername(defaultUsername);
            adminUser.setPassword(passwordEncoder.encode(defaultPassword));
            adminUser.setEmail(defaultEmail);
            adminUser.setName("SuperAdmin");
            adminUser.setPaternalSurname("Admin");
            adminUser.setMaternalSurname("Default");
            adminUser.setEnabled(true);

            userRepository.save(adminUser);

            log.info("Super Admin creado. Username: {}", defaultUsername);
        } else {
            log.info("La base de datos ya contiene administradores. Seeding omitido.");
        }
    }
}
