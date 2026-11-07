"""Feature engineering for the fraud model."""

import pandas as pd
from fraud.split import SECONDS_PER_DAY

SECONDS_PER_HOUR = 60 * 60

def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add the hour of the day and a 7-day cycle index, in place."""
    df["hour"] = (df["TransactionDT"] // SECONDS_PER_HOUR) % 24
    df["weekday"] = (df["TransactionDT"] // SECONDS_PER_DAY) % 7
    return df

def add_row_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add cents, a third-decimal flag, an identity flag and the missing count, in place."""
    df["n_missing"] = df.isna().sum(axis=1)
    amount = df["TransactionAmt"]
    df["amount_cents"] = (amount * 100).round() % 100
    df["amount_3dec"] = (amount * 1000).round() % 10 != 0
    df["has_identity"] = df["id_01"].notna()
    return df


def add_card_start_day(df: pd.DataFrame) -> pd.DataFrame:
    """Add the day the card was first used (transaction day minus D1), in place."""
    day = df["TransactionDT"] // SECONDS_PER_DAY
    df["card_start_day"] = day - df["D1"]
    return df