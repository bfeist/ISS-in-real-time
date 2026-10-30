"""Validate and order an update before any processing scripts are started.

Partial updates deliberately use existing outputs from omitted pipelines. Within
the selected pipelines, both pipeline and stage dependencies must be satisfied by
this run. YAML declaration order is only a tie-breaker for independent work.
"""

from dataclasses import replace
from typing import Callable

from .models import PipelineConfig, StageConfig


def _dependency_order(
    ids: list[str], dependencies: Callable[[str], list[str]], label: str
) -> list[str]:
    selected = set(ids)
    complete: set[str] = set()
    visiting: list[str] = []
    ordered: list[str] = []

    def visit(item: str) -> None:
        if item in complete:
            return
        if item in visiting:
            cycle = visiting[visiting.index(item) :] + [item]
            raise ValueError(f"{label} dependency cycle: {' -> '.join(cycle)}")
        visiting.append(item)
        for dependency in dependencies(item):
            if dependency in selected:
                visit(dependency)
        visiting.pop()
        complete.add(item)
        ordered.append(item)

    for item in ids:
        visit(item)
    return ordered


def build_execution_plan(
    configured: dict[str, PipelineConfig], pipeline_ids: list[str] | None = None
) -> list[PipelineConfig]:
    """Return ordered copies; never mutate the loaded configuration.

    Unknown references, disabled prerequisites and cycles are errors, including
    cross-pipeline stage references. An explicit empty selection runs nothing.
    """
    selected_ids = (
        [pid for pid, pipeline in configured.items() if pipeline.enabled]
        if pipeline_ids is None
        else list(dict.fromkeys(pipeline_ids))
    )
    for pid in selected_ids:
        if pid not in configured or not configured[pid].enabled:
            raise ValueError(f"Unknown or disabled pipeline: {pid}")

    planned: dict[str, PipelineConfig] = {}
    prerequisites: dict[str, list[str]] = {}

    def require_pipeline(pid: str, owner: str) -> PipelineConfig:
        if pid not in configured:
            raise ValueError(f"{owner} depends on unknown pipeline {pid}")
        dependency = configured[pid]
        if not dependency.enabled:
            raise ValueError(f"{owner} depends on disabled pipeline {pid}")
        return dependency

    for pid in selected_ids:
        pipeline = configured[pid]
        all_stages = {stage.id: stage for stage in pipeline.stages}
        if len(all_stages) != len(pipeline.stages):
            raise ValueError(f"Duplicate stage IDs in pipeline {pid}")
        stages: dict[str, StageConfig] = {
            sid: stage for sid, stage in all_stages.items() if stage.enabled
        }
        prerequisites[pid] = list(pipeline.depends_on)
        for dependency in pipeline.depends_on:
            require_pipeline(dependency, pid)

        for stage in stages.values():
            owner = f"{pid}.{stage.id}"
            for dependency in stage.depends_on_stages:
                if dependency not in stages:
                    raise ValueError(
                        f"{owner} depends on unknown or disabled stage {pid}.{dependency}"
                    )
            for dependency in stage.cross_dependencies:
                dep_pid = dependency.get("pipeline")
                dep_sid = dependency.get("stage")
                if not dep_pid or not dep_sid:
                    raise ValueError(f"Incomplete cross dependency for {owner}")
                if dep_pid == pid:
                    raise ValueError(f"Use depends_on_stages for dependencies within {pid}")
                dep_pipeline = require_pipeline(dep_pid, owner)
                if not any(s.id == dep_sid and s.enabled for s in dep_pipeline.stages):
                    raise ValueError(
                        f"{owner} depends on unknown or disabled stage {dep_pid}.{dep_sid}"
                    )
                prerequisites[pid].append(dep_pid)

        stage_order = _dependency_order(
            list(stages), lambda sid: stages[sid].depends_on_stages, f"Stage ({pid})"
        )
        planned[pid] = replace(pipeline, stages=[stages[sid] for sid in stage_order])

    pipeline_order = _dependency_order(selected_ids, lambda pid: prerequisites[pid], "Pipeline")
    # Keep comm whole and run it after independent data pipelines. Its consumers
    # (including aggregation) must remain after it. The dependency order above
    # ensures this also propagates through indirect consumers.
    deferred = {"comm"} & set(pipeline_order)
    for pid in pipeline_order:
        if deferred.intersection(prerequisites[pid]):
            deferred.add(pid)
    pipeline_order = (
        [pid for pid in pipeline_order if pid not in deferred]
        + [pid for pid in pipeline_order if pid in deferred]
    )
    return [planned[pid] for pid in pipeline_order]
