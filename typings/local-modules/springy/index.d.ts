declare module "springy" {
	class Node {
		id: number;
		data: any;
	}
	
	class Edge {
		id: number|string;
		source: Node;
		target: Node;
		data: any;
	}
	
	class Graph {
		addNode(node: Node): Node;
		addNodes(names: string[]): void;
		addEdge(edge: Edge): Edge;
		addEdges(...edges: Array<[string, string, any]>): void;
		newNode(data?: { label?: string }): Node;
		newEdge(source: Node, target: Node, data?: any): Edge;
		loadJSON(json: string|{
			nodes?: string[];
			edges?: Array<[string, string, any]>;
		}): void;
		getEdges(node1: Node, noode2: Node): Edge[];
		removeNode(node: Node): void;
		detachNode(node: Node): void;
		removeEdge(edge: Edge): void;
		merge(data: any): void;
		filterNodes(fn: (node: Node) => boolean): void;
		filterEdges(fn: (edge: Edge) => boolean): void;
		addGraphListener(listener: { graphChanged() }): void;
		notify(): void;
	}
	
	class Vector {
		x: number;
		y: number;
		constructor(x: number, y: number);
		add(v2: Vector): Vector;
		subtract(v2: Vector): Vector;
		multiply(v2: Vector): Vector;
		divide(v2: Vector): Vector;
		magnitude(v2: Vector): Vector;
		normal(): Vector;
		normalise(): Vector;
	}
	
	namespace Layout {
		class ForceDirected {
			graph: Graph;
			constructor(
				graph: Graph,
				stiffness: number,
				repulsion: number,
				damping: number,
				minEnergyThreshold?: number);
			point(node: Node): ForceDirected.Point;
			spring(edge: Edge): ForceDirected.Spring;
			eachNode(callback: (node: Node, point: ForceDirected.Point) => void): void;
			eachEdge(callback: (node: Edge, spring: ForceDirected.Spring) => void): void;
			eachSpring(callback: (spring: ForceDirected.Spring) => void): void;
			tick(timestep: number): void;
		}
		
		module ForceDirected {
			class Point {
				p: Vector; // position
				m: number; // mass
				v: Vector; // velocity
				a: Vector; // acceleration
				constructor(position: Vector, mass: number);
				applyForce(force: Vector): void;
				start(render?: () => void, onRenderStop?: () => void, onRenderStart?: () => void): void;
				stop(): void;
			}
			
			class Spring {
				point1: Point;
				point2: Point;
				length: number; // spring length at rest
				k: number; // spring constant (See Hooke's law)
				constructor(point1: Point, point2: Point, length: number, k: number);
			}
		}
		
		class Renderer {
			constructor(
				layout: ForceDirected,
				clear: () => void,
				drawEdge: (edge: Edge, p1: ForceDirected.Point, p2: ForceDirected.Point) => void,
				drawNode: (node: Node, p: ForceDirected.Point) => void,
				onRenderStop?: () => void,
				onRenderStart?: () => void);
		}
	}
}
