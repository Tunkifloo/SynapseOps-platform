package com.synapseops.orchestrator.infra.exception;

public class AccountLockedException extends RuntimeException {
    public AccountLockedException(String message) {
        super(message);
    }
}
