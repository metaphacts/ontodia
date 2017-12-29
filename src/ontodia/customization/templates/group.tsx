import * as React from 'react';

import { TemplateProps } from '../props';
import { EmbeddedLayer } from '../../diagram/embeddedLayer';

export class GroupTemplate extends React.Component<TemplateProps, void> {
    render() {
        const {label, icon, types, color, isExpanded} = this.props;

        return (
            <div className='ontodia-group-template'>
                <div className='ontodia-default-template ontodia-group-template__wrap' style={{
                    backgroundColor: color,
                    borderColor: color,
                }}>
                    <div className='ontodia-default-template_type-line' title={label}>
                        <div className={`${icon} ontodia-default-template_type-line__icon`} />
                        <div title={types} className='ontodia-default-template_type-line_text-container'>
                            <div className='ontodia-default-template_type-line_text-container__text'>
                                {types}
                            </div>
                        </div>
                    </div>
                    <div className='ontodia-default-template_body ontodia-group-template__body' style={{borderColor: color}}>
                    <span className='ontodia-default-template_body__label' title={label}>
                        {label}
                    </span>
                        {
                            isExpanded ? (
                                <div className='ontodia-group-template__embedded-layer'>
                                    <EmbeddedLayer />
                                </div>
                            ) : null
                        }
                    </div>
                </div>
            </div>
        );
    }
}
