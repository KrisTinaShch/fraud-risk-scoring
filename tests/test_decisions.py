import numpy as np

from fraud.decisions import choose_actions

def test_each_transactions_gets_the_cheapest_action():
    probs = np.array([0.001, 0.2, 0.9])
    amount = np.array([50.0, 100.0, 500.0])

    verify, decline = choose_actions(probs, amount)

    assert list(verify) == [False, True, False]
    assert list(decline) == [False, False, True]