"""Time-based train / validation / test split."""

import pandas as pd

SECONDS_PER_DAY = 24 * 60 * 60
VALID_START_DAY = 121
TEST_START_DAY = 151


def time_split(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    day = df["TransactionDT"] // SECONDS_PER_DAY
    train = df[day < VALID_START_DAY]
    valid = df[(day >= VALID_START_DAY) & (day < TEST_START_DAY)]
    test = df[day >= TEST_START_DAY]
    return train, valid, test