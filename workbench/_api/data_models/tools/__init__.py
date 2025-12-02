import cloudpickle

from . import metrics

cloudpickle.register_pickle_by_value(metrics)