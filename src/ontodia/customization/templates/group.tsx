import * as React from 'react';

import { TemplateProps } from '../props';

export class GroupTemplate extends React.Component<TemplateProps, void> {
    render() {
        const {label, embeddedLayer} = this.props;
        return (
            <div style={{background: '#ddd', padding: '5px 10px'}}>
                {label}
                {embeddedLayer}
            </div>
        );
    }
}
