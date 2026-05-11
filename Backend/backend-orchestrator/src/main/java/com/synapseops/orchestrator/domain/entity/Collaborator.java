package com.synapseops.orchestrator.domain.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity(name = "Collaborator")
@Table(name = "collaborators")
@Getter
@Setter
@NoArgsConstructor
public class Collaborator extends User{
    @Column(unique = true)
    private String studentCode;
    private String career;
}
