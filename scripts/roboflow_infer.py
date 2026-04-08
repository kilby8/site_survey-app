#!/usr/bin/env python3
"""
Simple Roboflow inference runner.

Usage:
  export ROBOFLOW_API_KEY="..."
  python scripts/roboflow_infer.py --image path/to/photo.jpg --model-id your-model-id/1
"""

import argparse
import json
import os
import sys

from inference_sdk import InferenceHTTPClient


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Roboflow inference on a local image")
    parser.add_argument("--image", required=True, help="Path to image file")
    parser.add_argument("--model-id", required=True, help="Roboflow model ID, e.g. electrical-inspection/1")
    parser.add_argument(
        "--api-url",
        default="https://detect.roboflow.com",
        help="Inference API URL",
    )
    parser.add_argument(
        "--api-key",
        default=os.getenv("ROBOFLOW_API_KEY"),
        help="Roboflow API key (defaults to ROBOFLOW_API_KEY env var)",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    if not args.api_key:
        print("Missing API key. Set ROBOFLOW_API_KEY or pass --api-key.", file=sys.stderr)
        return 1

    if not os.path.exists(args.image):
        print(f"Image not found: {args.image}", file=sys.stderr)
        return 1

    client = InferenceHTTPClient(api_url=args.api_url, api_key=args.api_key)
    result = client.infer(args.image, model_id=args.model_id)
    print(json.dumps(result, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
