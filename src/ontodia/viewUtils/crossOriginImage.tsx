import * as React from 'react';
import { Component, HTMLProps, ImgHTMLAttributes } from 'react';

export interface CrossOriginImageProps extends HTMLProps<HTMLDivElement> {
    imageProps: ImgHTMLAttributes<HTMLImageElement>;
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
