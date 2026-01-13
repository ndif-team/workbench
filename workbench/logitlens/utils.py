"""Utility functions for logitlens."""


def get_value(saved):
    """
    Helper to get value from saved tensor (nnsight proxy or direct tensor).

    In nnsight remote execution, saved tensors are proxy objects with a .value
    attribute. In local execution, they're direct tensors. This helper handles
    both cases transparently.

    Args:
        saved: Either an nnsight proxy object or a direct tensor

    Returns:
        The underlying tensor value
    """
    try:
        return saved.value
    except AttributeError:
        return saved
