import * as React from 'react';
import { Component, HTMLAttributes } from 'react';

export interface CrossOriginImageProps extends HTMLAttributes<HTMLDivElement> {
    imageProps: HTMLAttributes<HTMLImageElement>;
}

export interface State {
    readonly loading?: boolean;
    readonly canUseCrossOrigin?: boolean;
}

export class CrossOriginImage extends Component<CrossOriginImageProps, State> {
    constructor(props: CrossOriginImageProps, context?: any) {
        super(props, context);
        this.state = {loading: true};
    }

    render() {
        const {imageProps, ...divProps} = this.props;
        const {loading, canUseCrossOrigin} = this.state;
        if (loading) {
            return (
                <div {...divProps}>
                    <img key='fallback' {...imageProps} />
                    <img key='crossOrigin' style={{display: 'none'}}
                        src={imageProps.src}
                        crossOrigin='anonymous'
                        onLoad={this.onCrossOriginLoad}
                        onError={this.onCrossOriginError} />
                </div>
            );
        } else if (canUseCrossOrigin) {
            return (
                <div {...divProps}>
                    <img key='crossOrigin' {...imageProps} crossOrigin={'anonymous'} />
                </div>
            );
        } else {
            return (
                <div {...divProps}>
                    <img key='fallback' {...imageProps} />
                </div>
            );
        }
    }

    componentWillReceiveProps(nextProps: CrossOriginImageProps) {
        if (nextProps.imageProps.src !== this.props.imageProps.src) {
            this.setState({loading: true, canUseCrossOrigin: undefined});
        }
    }

    private onCrossOriginLoad = () => {
        this.setState({loading: false, canUseCrossOrigin: true});
    }

    private onCrossOriginError = () => {
        this.setState({loading: false, canUseCrossOrigin: false});
    }
}
