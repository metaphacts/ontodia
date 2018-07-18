import * as React from 'react';

import { TemplateProps } from '../props';
import { EmbeddedLayer } from '../../diagram/embeddedLayer';

const CLASS = 'ontodia-group-template';

export class GroupTemplate extends React.Component<TemplateProps, {}> {
    render() {
        const {label, iconUrl, types, color, isExpanded} = this.props;

        return (
            <div className={CLASS}>
                <div className={`${CLASS}__wrap`} style={{
                    backgroundColor: color,
                    borderColor: color,
                }}>
                    <div className={`${CLASS}__type-line`} title={label}>
                        <div className={`${CLASS}__type-line-icon`}>
                            <img src={iconUrl} />
                        </div>
                        <div title={types} className={`${CLASS}__type-line-text-container`}>
                            <div className={`${CLASS}__type-line-text`}>
                                {types}
                            </div>
                        </div>
                    </div>
                    <div className={`${CLASS}__body`} style={{borderColor: color}}>
                        <span className={`${CLASS}__label`} title={label}>
                            {label}
                        </span>
                        {
                            isExpanded ? (
                                <div className={`${CLASS}__embedded-layer`}>
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
