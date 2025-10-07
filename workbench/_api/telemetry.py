import logging
import os
import time
from enum import Enum
from tkinter.constants import NONE
from typing import TYPE_CHECKING, Optional

from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

logger = logging.getLogger(__name__)

if TYPE_CHECKING:
    from ..state import AppState

class RequestStatus(Enum):
    STARTED = "STARTED"
    READY = "READY"
    COMPLETE = "COMPLETE"
    ERROR = "ERROR"

class Stage(Enum):
    DOWNLOAD = "DOWNLOAD"


class TelemetryClient:
    _client = NONE
    _initialized = False

    class LatencyRecorder:
        def __init__(self, 
            user_email: str,
            job_id: str,
            method: str,
            type: str,
            stage: Stage,
        ):
            self.user_email = user_email
            self.job_id = job_id
            self.method = method
            self.type = type
            self.stage = stage
            self.start_time = time.time()

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc_value, traceback):
            if exc_type is None:
                latency = time.time() - self.start_time
                TelemetryClient._log_latency(
                    user_email=self.user_email,
                    job_id=self.job_id, 
                    method=self.method, 
                    type=self.type, 
                    stage=self.stage, 
                    latency=latency
                )
            else:
                TelemetryClient.log_request(
                    status=RequestStatus.ERROR,
                    user_email=self.user_email,
                    method=self.method,
                    type=self.type,
                    metric=None,
                    job_id=self.job_id,
                    msg=str(traceback)
                )

    @classmethod
    def init(cls, state: "AppState"):
        if not cls._initialized:
            cls._client = InfluxDBClient(
                url=state.telemetry_url, 
                token=os.getenv("INFLUXDB_ADMIN_TOKEN")
            ).write_api(write_options=SYNCHRONOUS)
            logger.info(f'INFLUXDB Bucket: {os.getenv("INFLUXDB_BUCKET", "workbench-dev")}')
            cls._initialized = True


    @classmethod
    def log_request(
        cls,
        status: RequestStatus,
        user_email: str,
        method: str,
        type: str,
        metric: Optional[str] = None,
        job_id: Optional[str] = None,
        msg: str = "",
    ):

        if cls._initialized:

            point: Point = Point("request_status").field("status", status.value)

            point = point\
            .tag("user_email", user_email)\
            .tag("method", method)\
            .tag("type", type)

            if metric:
                point = point.tag("metric", metric)

            if job_id:
                point = point.tag("job_id", job_id)

            if msg:
                point = point.tag("msg", msg)

            cls._client.write(
                bucket=os.getenv("INFLUXDB_BUCKET", "workbench-dev"),
                org=os.getenv("INFLUXDB_ORG", "NDIF"),
                record=point,
            )

    @classmethod
    def log_latency(
        cls,
        user_email: str,
        job_id: str,
        method: str,
        type: str,
        stage: Stage,
    ):
        return TelemetryClient.LatencyRecorder(user_email, job_id, method, type, stage)

    @classmethod
    def _log_latency(
        cls, 
        user_email: str,
        job_id: str, 
        method: str, 
        type: str, 
        stage: Stage, 
        latency: float
    ):
        if cls._initialized:
            point: Point = Point("latency").field("latency", latency)
            point = point\
            .tag("user_email", user_email)\
            .tag("job_id", job_id)\
            .tag("stage", stage.value)\
            .tag("method", method)\
            .tag("type", type)
            
            cls._client.write(
                bucket=os.getenv("INFLUXDB_BUCKET", "workbench-dev"),
                org=os.getenv("INFLUXDB_ORG", "NDIF"),
                record=point,
            )
