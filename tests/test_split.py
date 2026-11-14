import pandas as pd

from fraud.split import SECONDS_PER_DAY, time_split

def test_days_go_to_the_right_part():
    days = [1, 120, 121, 150, 151, 182]
    df = pd.DataFrame({'TransactionDT': [day*SECONDS_PER_DAY for day in days]})

    train, valid, test = time_split(df)

    assert list(train['TransactionDT'] // SECONDS_PER_DAY) == [1, 120]
    assert list(valid['TransactionDT'] // SECONDS_PER_DAY) == [121, 150]
    assert list(test['TransactionDT'] // SECONDS_PER_DAY) == [151, 182]