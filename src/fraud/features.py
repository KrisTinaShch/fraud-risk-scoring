"""Feature engineering for the fraud model."""

import pandas as pd
from fraud.split import SECONDS_PER_DAY

SECONDS_PER_HOUR = 60 * 60

def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    """Add the hour of the day and a 7-day cycle index, in place."""
    df["hour"] = (df["TransactionDT"] // SECONDS_PER_HOUR) % 24
    df["weekday"] = (df["TransactionDT"] // SECONDS_PER_DAY) % 7
    return df