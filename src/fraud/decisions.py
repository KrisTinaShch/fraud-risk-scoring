"""Decisions from calibrated fraud probabilities: approve, ask to confirm or decline, and their cost."""

import numpy as np

FRAUD_FEE = 20
DECLINE_COST = 10
VERIFY_COST = 2
VERIFY_PASS = 0.1


def choose_actions(
    probs: np.ndarray, amount: np.ndarray, verify_cost: float = VERIFY_COST
) -> tuple[np.ndarray, np.ndarray]:
    """Give each transaction the cheapest action by expected loss; return the verify and decline masks."""
    approve_loss = probs * (amount + FRAUD_FEE)
    verify_loss = (1 - probs) * verify_cost + probs * VERIFY_PASS * (amount + FRAUD_FEE)
    decline_loss = (1 - probs) * DECLINE_COST
    decline = (decline_loss < approve_loss) & (decline_loss < verify_loss)
    verify = ~decline & (verify_loss < approve_loss)
    return verify, decline


def total_loss(
    fraud: np.ndarray,
    amount: np.ndarray,
    verify: np.ndarray,
    decline: np.ndarray,
    verify_cost: float = VERIFY_COST,
) -> float:
    """Money lost on labelled transactions under the given actions; the rest are approved."""
    approve = ~verify & ~decline
    honest = ~fraud
    return float(
        (amount[fraud & approve] + FRAUD_FEE).sum()
        + VERIFY_PASS * (amount[fraud & verify] + FRAUD_FEE).sum()
        + verify_cost * (honest & verify).sum()
        + DECLINE_COST * (honest & decline).sum()
    )
