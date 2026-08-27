FROM gcc:13.3.0-bookworm

ARG DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends gdb=13.1-3 python3=3.11.2-1+b1 ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 runner \
    && useradd --uid 10001 --gid runner --no-create-home --home-dir /nonexistent runner

WORKDIR /opt/seeplusplus
COPY runner/local/entrypoint.py runner/local/gdb_trace.py runner/local/trace_alloc.cpp ./
RUN chmod 0555 entrypoint.py gdb_trace.py && chmod 0444 trace_alloc.cpp

USER 10001:10001
ENTRYPOINT ["python3", "/opt/seeplusplus/entrypoint.py"]
