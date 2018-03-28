import * as React from 'react';
import * as _ from 'lodash';

import { Dictionary, LocalizedString } from '../data/model';
import { FatClassModel } from '../diagram/elements';
import { DiagramView } from '../diagram/view';
import { EventObserver } from '../viewUtils/events';
import { formatLocalizedLabel } from '../diagram/model';
import { Node } from './node';

require('jstree/dist/themes/default/style.css');

export interface TreeNodesProps {
    roots?: ReadonlyArray<FatClassModel> | undefined;
    expanded?: Boolean;
    resultIds?: Array<string> | undefined;
    searchString?: string | undefined;
    lang?: Readonly<string> | undefined;
}

const CLASS_NAME = 'ontodia-class-tree';

export class TreeNodes extends React.Component<TreeNodesProps, {}> {
    public static defaultProps: Partial<TreeNodesProps> = {
        expanded: true
    };

    constructor(props: TreeNodesProps) {
        super(props);
        this.filter = this.filter.bind(this);
    }

    filter(root: FatClassModel): Boolean {
        const { resultIds } = this.props;
        if (resultIds) {
            return Boolean(resultIds.find(id => root.id === id));
        } else {
            return true;
        }
    }

    compare(node1: FatClassModel, node2: FatClassModel) {
        if (node1.label[0].text < node2.label[0].text) {
            return -1;
        } else {
            return 1;
        }
    }
    getRenderRoots() {
        let roots;
        if (this.props.resultIds && this.props.resultIds.length === 0) {
            roots = this.props.roots;
        } else {
            roots = this.props.roots && this.props.roots.filter(this.filter).sort(this.compare);
        }
        return roots;
    }
    render() {
        let { expanded, resultIds, searchString, lang } = this.props;
        const roots = this.getRenderRoots();

        return (
            <ul className={`${CLASS_NAME}__elements`} style={{ display: expanded ? 'block' : 'none' }}>
                {roots && roots.map(element => (
                    <div key={`node-${element.id}`}>
                        <Node node={element} resultIds={resultIds}
                            lang={lang} searchString={searchString} />
                    </div>
                ))}
            </ul>
        );
    }
}
export default TreeNodes;
