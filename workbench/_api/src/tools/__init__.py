import cloudpickle
from . import metrics, utils

cloudpickle.register_pickle_by_value(metrics)
cloudpickle.register_pickle_by_value(utils)