"""Loading the IEEE-CIS training data."""

from pathlib import Path

import pandas as pd

PROJECT_ROOT = Path(__file__).resolve().parents[2]
RAW_DIR = PROJECT_ROOT / "data" / "raw"
INTERIM_DIR = PROJECT_ROOT / "data" / "interim"
TRAIN_PARQUET = INTERIM_DIR / "train.parquet"


def reduce_memory(df: pd.DataFrame, keep=("TransactionAmt",)) -> pd.DataFrame:
    """Downcast numeric columns and convert text columns to category, in place."""
    for col in df.columns:
        if col in keep:
            continue
        if pd.api.types.is_integer_dtype(df[col]):
            df[col] = pd.to_numeric(df[col], downcast="integer")
        elif pd.api.types.is_float_dtype(df[col]):
            df[col] = df[col].astype("float32")
        elif pd.api.types.is_string_dtype(df[col]):
            df[col] = df[col].astype("category")
    return df


def build_train() -> pd.DataFrame:
    """Merge the raw CSVs, reduce memory and cache the result as Parquet."""
    transactions = pd.read_csv(RAW_DIR / "train_transaction.csv")
    identity = pd.read_csv(RAW_DIR / "train_identity.csv")
    train = transactions.merge(identity, on="TransactionID", how="left", validate="one_to_one")
    del transactions, identity

    train = reduce_memory(train)
    INTERIM_DIR.mkdir(parents=True, exist_ok=True)
    train.to_parquet(TRAIN_PARQUET, index=False)
    return train


def load_train() -> pd.DataFrame:
    """Return the merged training table, building the Parquet cache on first use."""
    if TRAIN_PARQUET.exists():
        return pd.read_parquet(TRAIN_PARQUET)
    return build_train()