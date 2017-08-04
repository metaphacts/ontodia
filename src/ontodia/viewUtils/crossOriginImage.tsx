import * as React from 'react';
import { Component, HTMLAttributes } from 'react';

export interface CrossOriginImageProps extends HTMLAttributes<HTMLDivElement> {
    imageProps: HTMLAttributes<HTMLImageElement>;
}

export class CrossOriginImage extends Component<CrossOriginImageProps, {}> {
    render() {
        const {imageProps, ...divProps} = this.props;
        return (
            <div {...divProps}>
                <img {...imageProps} />
            </div>
        );
    }
}
