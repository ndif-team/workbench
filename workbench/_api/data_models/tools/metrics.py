from enum import Enum

class Metrics(str, Enum):
    PROBABILITY = "probability"
    RANK = "rank"
    ENTROPY = "entropy"