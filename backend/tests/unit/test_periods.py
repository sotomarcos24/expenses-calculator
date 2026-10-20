from datetime import date

import pytest

from app.services.periods import months_in_period


@pytest.mark.parametrize(
    ("date_from", "date_to", "expected"),
    [
        (date(2026, 3, 1), date(2026, 3, 31), 1),  # month preset
        (date(2026, 1, 1), date(2026, 3, 15), 3),  # year preset in March
        (date(2026, 1, 31), date(2026, 2, 1), 2),  # custom, partial months count
        (date(2025, 11, 15), date(2026, 2, 10), 4),  # spans a year end
        (date(2026, 5, 9), date(2026, 5, 9), 1),  # single day
    ],
)
def test_months_in_period(date_from: date, date_to: date, expected: int) -> None:
    assert months_in_period(date_from, date_to) == expected
