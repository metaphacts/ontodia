import * as React from 'react';

import { TemplateProps } from '../props';

const CLASS_NAME = 'ontodia-default-template';

export class BlankNodeTemplate extends React.Component<TemplateProps, {}> {
    render() {
        const props = this.props;

        return (
            <div className='ontodia-blank-node-template' title={props.types}>
            </div>
        );
    }
}
