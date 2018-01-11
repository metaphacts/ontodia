import { Element as DiagramElement, Link as DiagramLink } from './elements';
import { isIE11 } from '../viewUtils/detectBrowser';

export interface Vector {
    readonly x: number;
    readonly y: number;
}

export interface Size {
    readonly width: number;
    readonly height: number;
}

export interface Rect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

export function boundsOf(element: DiagramElement): Rect {
    const {x, y} = element.position;
    const {width, height} = element.size;
    return {x, y, width, height};
}

function centerOfRectangle({x, y, width, height}: Rect): Vector {
    return {x: x + width / 2, y: y + height / 2};
}

function length({x, y}: Vector) {
    return Math.sqrt(x * x + y * y);
}

export function normalize({x, y}: Vector) {
    if (x === 0 && y === 0) { return {x, y}; }
    const inverseLength = 1 / Math.sqrt(x * x + y * y);
    return {x: x * inverseLength, y: y * inverseLength};
}

function dot({x: x1, y: y1}: Vector, {x: x2, y: y2}: Vector): number {
    return x1 * x2 + y1 * y2;
}

function cross2D({x: x1, y: y1}: Vector, {x: x2, y: y2}: Vector) {
    return x1 * y2 - y1 * x2;
}

function intersectRayFromRectangleCenter(sourceRect: Rect, rayTarget: Vector) {
    const isTargetInsideRect =
        sourceRect.width === 0 || sourceRect.height === 0 ||
        rayTarget.x > sourceRect.x && rayTarget.x < (sourceRect.x + sourceRect.width) &&
        rayTarget.y > sourceRect.y && rayTarget.y < (sourceRect.y + sourceRect.height);

    const halfWidth = sourceRect.width / 2;
    const halfHeight = sourceRect.height / 2;
    const center = {
        x: sourceRect.x + halfWidth,
        y: sourceRect.y + halfHeight,
    };
    if (isTargetInsideRect) {
        return center;
    }

    const direction = normalize({
        x: rayTarget.x - center.x,
        y: rayTarget.y - center.y,
    });

    const rightDirection = {x: Math.abs(direction.x), y: direction.y};
    const isHorizontal =
        cross2D({x: halfWidth, y: -halfHeight}, rightDirection) > 0 &&
        cross2D({x: halfWidth, y: halfHeight}, rightDirection) < 0;

    if (isIE11()) {
        Math.sign = function (n: number): number {
            if (n > 0) { return 1; } else if (n < 0) { return -1; } else { return 0; }
        };
    }

    if (isHorizontal) {
        return {
            x: center.x + halfWidth * Math.sign(direction.x),
            y: center.y + halfWidth * direction.y / Math.abs(direction.x),
        };
    } else {
        return {
            x: center.x + halfHeight * direction.x / Math.abs(direction.y),
            y: center.y + halfHeight * Math.sign(direction.y),
        };
    }
}

export function computePolyline(
    source: DiagramElement,
    target: DiagramElement,
    vertices: ReadonlyArray<Vector>,
): Vector[] {
    const sourceRect = boundsOf(source);
    const targetRect = boundsOf(target);
    const startPoint = intersectRayFromRectangleCenter(
        sourceRect, vertices.length > 0 ? vertices[0] : centerOfRectangle(targetRect));
    const endPoint = intersectRayFromRectangleCenter(
        targetRect, vertices.length > 0 ? vertices[vertices.length - 1] : centerOfRectangle(sourceRect));
    return [startPoint, ...vertices, endPoint];
}

export function computePolylineLength(polyline: ReadonlyArray<Vector>): number {
    let previous: Vector;
    return polyline.reduce((acc, point) => {
        const segmentLength = previous ? length({x: point.x - previous.x, y: point.y - previous.y}) : 0;
        previous = point;
        return acc + segmentLength;
    }, 0);
}

export function getPointAlongPolyline(polyline: ReadonlyArray<Vector>, offset: number): Vector {
    if (polyline.length === 0) {
        throw new Error('Cannot compute a point for empty polyline');
    }
    if (offset < 0) {
        return polyline[0];
    }
    let currentOffset = 0;
    for (let i = 1; i < polyline.length; i++) {
        const previous = polyline[i - 1];
        const point = polyline[i];
        const segment = {x: point.x - previous.x, y: point.y - previous.y};
        const segmentLength = length(segment);
        const newOffset = currentOffset + segmentLength;
        if (offset < newOffset) {
            const leftover = (offset - currentOffset) / segmentLength;
            return {
                x: previous.x + leftover * segment.x,
                y: previous.y + leftover * segment.y,
            };
        } else {
            currentOffset = newOffset;
        }
    }
    return polyline[polyline.length - 1];
}

export function findNearestSegmentIndex(polyline: ReadonlyArray<Vector>, location: Vector): number {
    let minDistance = Infinity;
    let foundIndex = 0;

    for (let i = 0; i < polyline.length - 1; i++) {
        const pivot = polyline[i];
        const next = polyline[i + 1];

        const target = {x: location.x - pivot.x, y: location.y - pivot.y};
        const segment = {x: next.x - pivot.x, y: next.y - pivot.y};
        const segmentLength = length(segment);

        const projectionToSegment = dot(target, segment) / segmentLength;
        if (projectionToSegment < 0 || projectionToSegment > segmentLength) {
            continue;
        }

        const distanceToSegment = Math.abs(cross2D(target, segment)) / segmentLength;
        if (distanceToSegment < minDistance) {
            minDistance = distanceToSegment;
            foundIndex = i;
        }
    }
    return foundIndex;
}
