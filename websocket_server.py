# Copyright (C) 2026 xis.ai Technical Assessment
# SPDX-License-Identifier: MIT

"""
Standalone high-performance WebSocket server for live CVAT Annotation Analytics streaming.
Runs on ws://127.0.0.1:8001/ws/tasks/{task_id}/annotations/
Handles Requirement 8 (live graph updates) & Requirement 9 (drop and recovery).
"""

import os
import sys
import json
import asyncio
import random
import logging
from urllib.parse import urlparse

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "cvat.settings")
import django
django.setup()

import websockets
from cvat.apps.engine.models import Task, LabeledShape, Label, Job, ShapeType
from cvat.apps.test.services import compute_task_annotation_counts

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("cvat_websocket")

CONNECTED_CLIENTS = {}  # task_id -> set of websocket connections


async def register(websocket, task_id: int):
    if task_id not in CONNECTED_CLIENTS:
        CONNECTED_CLIENTS[task_id] = set()
    CONNECTED_CLIENTS[task_id].add(websocket)
    logger.info(f"Client joined task {task_id}. Total listeners on task {task_id}: {len(CONNECTED_CLIENTS[task_id])}")


async def unregister(websocket, task_id: int):
    if task_id in CONNECTED_CLIENTS:
        CONNECTED_CLIENTS[task_id].discard(websocket)
        if not CONNECTED_CLIENTS[task_id]:
            del CONNECTED_CLIENTS[task_id]
    logger.info(f"Client disconnected from task {task_id}.")


async def broadcast_task_update(task_id: int, event_type: str = "annotation_updated", details: dict = None):
    """Broadcasts refreshed annotation counts to all subscribers of task_id"""
    if task_id not in CONNECTED_CLIENTS or not CONNECTED_CLIENTS[task_id]:
        return

    try:
        analytics = await asyncio.to_thread(compute_task_annotation_counts, task_id)
        payload = json.dumps({
            "type": event_type,
            "task_id": task_id,
            "details": details or {},
            "analytics": analytics,
            "timestamp": asyncio.get_event_loop().time()
        })
        
        # Broadcast concurrently
        subscribers = list(CONNECTED_CLIENTS[task_id])
        if subscribers:
            await asyncio.gather(
                *[client.send(payload) for client in subscribers],
                return_exceptions=True
            )
            logger.info(f"Broadcasted {event_type} to {len(subscribers)} clients on task {task_id}")
    except Exception as e:
        logger.error(f"Error broadcasting task update: {e}")


async def handle_connection(websocket, path: str = None):
    # Support both websockets v12+ and earlier path signatures
    try:
        request_path = getattr(websocket, "path", path) or ""
    except Exception:
        request_path = path or ""

    # Expected path: /ws/tasks/<task_id>/annotations/
    parts = [p for p in request_path.strip("/").split("/") if p]
    task_id = 1  # default
    if len(parts) >= 3 and parts[0] == "ws" and parts[1] == "tasks":
        try:
            task_id = int(parts[2])
        except ValueError:
            task_id = 1

    await register(websocket, task_id)

    try:
        # Send initial state snapshot upon connection (safely dispatched via thread)
        analytics = await asyncio.to_thread(compute_task_annotation_counts, task_id)
        await websocket.send(json.dumps({
            "type": "initial_state",
            "task_id": task_id,
            "analytics": analytics,
            "message": "Connected to CVAT Real-Time Annotation Stream"
        }))

        # Handle incoming client messages
        async for message in websocket:
            try:
                data = json.loads(message)
                action = data.get("action")

                if action == "ping":
                    await websocket.send(json.dumps({"type": "pong", "time": asyncio.get_event_loop().time()}))

                elif action == "simulate_annotation":
                    label_name = data.get("label_name", "person")
                    shape_type = data.get("shape_type", ShapeType.RECTANGLE)

                    def do_create_shape():
                        task = Task.objects.get(pk=task_id)
                        lbl = Label.objects.filter(task=task, name=label_name).first() or Label.objects.filter(task=task).first()
                        job = Job.objects.filter(segment__task=task).first()
                        if lbl and job:
                            shape = LabeledShape.objects.create(
                                job=job,
                                label=lbl,
                                frame=random.randint(0, 100),
                                type=shape_type,
                                points="50,50,150,150"
                            )
                            return shape.id, lbl.name, lbl.color
                        return None, None, None

                    shape_id, lbl_name, lbl_color = await asyncio.to_thread(do_create_shape)
                    if shape_id:
                        await broadcast_task_update(
                            task_id,
                            event_type="annotation_created",
                            details={"shape_id": shape_id, "label": lbl_name, "color": lbl_color}
                        )

                elif action == "simulate_delete":
                    def do_delete_shape():
                        task = Task.objects.get(pk=task_id)
                        shape = LabeledShape.objects.filter(job__segment__task=task).order_by("-id").first()
                        if shape:
                            name = shape.label.name
                            sid = shape.id
                            shape.delete()
                            return sid, name
                        return None, None

                    shape_id, lbl_name = await asyncio.to_thread(do_delete_shape)
                    if shape_id:
                        await broadcast_task_update(
                            task_id,
                            event_type="annotation_deleted",
                            details={"shape_id": shape_id, "label": lbl_name}
                        )

                elif action == "switch_task":
                    new_task_id = int(data.get("task_id", 1))
                    await unregister(websocket, task_id)
                    task_id = new_task_id
                    await register(websocket, task_id)
                    analytics = await asyncio.to_thread(compute_task_annotation_counts, task_id)
                    await websocket.send(json.dumps({
                        "type": "initial_state",
                        "task_id": task_id,
                        "analytics": analytics,
                    }))

            except json.JSONDecodeError:
                await websocket.send(json.dumps({"type": "error", "message": "Invalid JSON"}))
            except Exception as e:
                logger.error(f"Error processing client message: {e}")
                await websocket.send(json.dumps({"type": "error", "message": str(e)}))

    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        await unregister(websocket, task_id)


async def main():
    host = "127.0.0.1"
    port = 8001
    logger.info(f"Starting CVAT Annotation Analytics WebSocket Server on ws://{host}:{port}...")
    server = await websockets.serve(handle_connection, host, port)
    logger.info(f"WebSocket Server running on ws://{host}:{port}")
    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
