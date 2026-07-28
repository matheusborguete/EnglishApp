"""Configuração de path para os testes (permite ``import core.*``)."""

import os
import sys

# Adiciona a raiz do projeto (attribution_app/) ao path.
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if ROOT not in sys.path:
    sys.path.insert(0, ROOT)

import pandas as pd
import pytest

from core import sample_data


@pytest.fixture(scope="session")
def datasets():
    interactions, enrollments, investments = sample_data.generate(seed=7, n_leads=120)
    return interactions, enrollments, investments
