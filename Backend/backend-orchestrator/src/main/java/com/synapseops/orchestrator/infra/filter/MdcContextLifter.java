package com.synapseops.orchestrator.infra.filter;

import org.slf4j.MDC;
import reactor.core.CoreSubscriber;
import reactor.core.publisher.Hooks;
import reactor.core.publisher.Operators;
import reactor.util.context.Context;

import java.util.stream.Collectors;

public class MdcContextLifter<T> implements reactor.core.CoreSubscriber<T> {

    private final CoreSubscriber<T> coreSubscriber;

    public MdcContextLifter(CoreSubscriber<T> coreSubscriber) {
        this.coreSubscriber = coreSubscriber;
    }

    @Override
    public Context currentContext() {
        return coreSubscriber.currentContext();
    }

    @Override
    public void onSubscribe(org.reactivestreams.Subscription s) {
        coreSubscriber.onSubscribe(s);
    }

    @Override
    public void onNext(T t) {
        copyContextToMdc(coreSubscriber.currentContext());
        coreSubscriber.onNext(t);
    }

    @Override
    public void onError(Throwable throwable) {
        copyContextToMdc(coreSubscriber.currentContext());
        coreSubscriber.onError(throwable);
    }

    @Override
    public void onComplete() {
        coreSubscriber.onComplete();
    }

    private void copyContextToMdc(Context context) {
        if (context.isEmpty()) {
            MDC.clear();
            return;
        }
        context.stream()
                .collect(Collectors.toMap(
                        e -> e.getKey().toString(),
                        e -> e.getValue().toString()
                ))
                .forEach(MDC::put);
    }

    public static void register() {
        Hooks.onEachOperator(
                "mdc-context-lifter",
                Operators.lift((scannable, subscriber) ->
                        new MdcContextLifter<>(subscriber))
        );
    }

    public static void reset() {
        Hooks.resetOnEachOperator("mdc-context-lifter");
    }
}
