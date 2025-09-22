from enum import Enum
from typing import TYPE_CHECKING
import os
from tkinter.constants import NONE
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

if TYPE_CHECKING:
    from ..state import AppState

class RequestStatus(Enum):
    STARTED = "STARTED"
    READY = "READY"
    COMPLETE = "COMPLETE"
    ERROR = "ERROR"


class TelemetryClient:
    _client = NONE
    _initialized = False

    @classmethod
    def log_request(
        cls,
        state: "AppState",
        status: RequestStatus,
        user_email: str,
        method: str,
        type: str,
        metric: str,
        job_id: str = None,
        msg: str = "",
    ):

        if state.remote:
            if not cls._initialized:
                cls._client = InfluxDBClient(
                    url=state.telemetry_url, 
                    token=os.getenv("INFLUXDB_ADMIN_TOKEN")
                ).write_api(write_options=SYNCHRONOUS)
                cls._initialized = True

            point: Point = Point("request_status").field("status", status.value)

            point = point\
            .tag("user_email", user_email)\
            .tag("method", method)\
            .tag("type", type)\
            .tag("metric", metric)

            if job_id:
                point = point.tag("job_id", job_id)

            if msg:
                point = point.tag("msg", msg)

            cls._client.write(
                bucket=os.getenv("INFLUXDB_BUCKET", "workbench-dev"),
                org=os.getenv("INFLUXDB_ORG", "NDIF"),
                record=point,
            )
