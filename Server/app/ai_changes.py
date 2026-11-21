"""Model date context and user-facing change previews."""

from copy import deepcopy
from app.financial_conditions import (
    LABELS,
    month_number,
    month_name,
    effective,
    build_candidate,
)


def model_context(state):
    start = month_number(state["startMonth"])
    return {
        "currentMonth": month_name(start + state["month"]),
        "nextMonth": month_name(start + state["month"] + 1),
        "lastMonth": month_name(start + 120),
    }


def describe_changes(original, intents):
    """Show every effective before/after interval, including existing future changes."""
    state = deepcopy(original)
    origin = month_number(state["startMonth"])
    details = []
    for intent in intents:
        candidate, _ = build_candidate(state, [intent])
        begin = month_number(intent.startMonth) - origin
        end = month_number(intent.endMonth) - origin if intent.endMonth else 120
        segments = []
        for index in range(begin, end + 1):
            before = effective(state, intent.field, index)
            after = effective(candidate, intent.field, index)
            if segments and (segments[-1]["before"], segments[-1]["after"]) == (before, after):
                segments[-1]["endMonth"] = month_name(origin + index)
            else:
                segments.append(
                    {
                        "startMonth": month_name(origin + index),
                        "endMonth": month_name(origin + index),
                        "before": before,
                        "after": after,
                    }
                )
        details.append(
            {
                "field": intent.field,
                "label": LABELS[intent.field],
                "operation": intent.operation,
                "amount": intent.amount,
                "startMonth": intent.startMonth,
                "endMonth": month_name(origin + end),
                "segments": segments,
            }
        )
        state = candidate
    return details
