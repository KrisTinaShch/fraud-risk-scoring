import pandas as pd

from fraud.features import add_card_start_day
from fraud.split import SECONDS_PER_DAY


def test_card_start_day_is_the_same_for_one_card():
    days = [130, 140, 140]
    df = pd.DataFrame(
        {
            "TransactionDT": [day * SECONDS_PER_DAY for day in days],
            "D1": [30, 40, None],
        }
    )

    df = add_card_start_day(df)

    assert list(df["card_start_day"].iloc[:2]) == [100, 100]
    assert pd.isna(df["card_start_day"].iloc[2])