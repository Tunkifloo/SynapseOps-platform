package com.synapseops.orchestrator.domain.entity;

import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity(name = "Admin")
@Table(name = "admins")
@Getter
@Setter
@NoArgsConstructor
public class Admin extends User{
}
