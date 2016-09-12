import * as _ from 'lodash';
import * as $ from 'jquery';
import * as joint from 'jointjs';
import { V, g } from 'jointjs';

export interface toSVGOptions {
    preserveDimensions?: boolean;
    convertImagesToDataUris?: boolean;
    blacklistedCssAttributes?: string[];
    elementsToRemoveSelector?: string;
}

export function toSVG(paper: joint.dia.Paper, callback: (svg: string) => void, opt?: toSVGOptions) {
    opt = opt || {};
    var viewportTransform = V(paper.viewport).attr("transform");
    V(paper.viewport).attr("transform", "");
    var viewportBbox = paper.getContentBBox();
    var svgClone = <SVGElement>paper.svg.cloneNode(true);
    V(paper.viewport).attr("transform", viewportTransform || "");
    svgClone.removeAttribute("style");
    if (opt.preserveDimensions) {
        V(svgClone).attr({width: viewportBbox.width, height: viewportBbox.height})
    } else {
        V(svgClone).attr({width: "100%", height: "100%"})
    }
    V(svgClone).attr("viewBox", viewportBbox.x + " " + viewportBbox.y + " " + viewportBbox.width + " " + viewportBbox.height);
    var styleSheetsCount = document.styleSheets.length;
    var styleSheetsCopy: StyleSheet[] = [];
    for (var i = styleSheetsCount - 1; i >= 0; i--) {
        styleSheetsCopy[i] = document.styleSheets[i];
        document.styleSheets[i].disabled = true
    }
    var defaultComputedStyles = {};
    $(paper.svg).find("*").each(function (idx) {
        var computedStyle = window.getComputedStyle(this, null);
        var defaultComputedStyle: {[property: string]: string} = {};
        _.each(computedStyle, function (property: string) {
            defaultComputedStyle[property] = computedStyle.getPropertyValue(property);
        });
        defaultComputedStyles[idx] = defaultComputedStyle
    });
    if (styleSheetsCount != document.styleSheets.length) {
        _.each(styleSheetsCopy, function (copy, i) {
            document.styleSheets[i] = copy
        })
    }
    for (var i = 0; i < styleSheetsCount; i++) {
        document.styleSheets[i].disabled = false
    }
    var customStyles = {};
    $(paper.svg).find("*").each(function (idx) {
        var computedStyle = window.getComputedStyle(this, null);
        var defaultComputedStyle = defaultComputedStyles[idx];
        var customStyle = {};
        _.each(computedStyle, function (property) {
            if (computedStyle.getPropertyValue(property) !== defaultComputedStyle[property]) {
                customStyle[property] = computedStyle.getPropertyValue(property);
            }
        });
        if (opt.blacklistedCssAttributes) {
            customStyle = _.omit(customStyle, opt.blacklistedCssAttributes);
        }
        var tagName = this.tagName.toLowerCase();
        if (tagName !== 'text' && tagName !== 'tspan' && tagName !== 'textPath' && tagName !== 'tref') {
            delete customStyle['font-family'];
            delete customStyle['font-size'];
        }
        customStyles[idx] = customStyle;
    });
    
    var $svgClone = $(svgClone);
    $svgClone.find("*").each(function (idx) {
        $(this).css(customStyles[idx]);
    });
    
    if (opt.elementsToRemoveSelector) {
        $svgClone.find(opt.elementsToRemoveSelector).remove();
    }
    
    var images: SVGImageElement[] = [];
    $svgClone.find("*").each(function () {
        $(this).removeAttr('event').removeAttr('class');
        if (this.tagName.toLowerCase() === "image") { images.push(this) }
    });
    
    function serialize(): string {
        return (new XMLSerializer).serializeToString(svgClone)
    }

    //var isSafari = Object.prototype.toString.call(window.HTMLElement).indexOf("Constructor") > 0;
    if (opt.convertImagesToDataUris && images.length) {
        const convertImages = (callback: () => void) => {
            var image = images.shift();
            if (!image) return callback();
            joint.util.imageToDataUri(V(image).attr("href"), function (err, dataUri) {
                V(image).attr("xlink:href", dataUri);
                convertImages(callback);
            })
        }
        convertImages(function () {
            callback(serialize())
        });
    } else {
        return callback(serialize());
    }
}

export interface toDataURLOptions {
    // "image/png" | "image/jpeg" | ...
    type?: string;
    width?: number;
    height?: number;
    padding?: number;
    backgroundColor?: string;
    quality?: number;
    svgOptions?: toSVGOptions;
}

declare var canvg: any;

export function toDataURL(paper: joint.dia.Paper, callback: (dataUrl: string) => void, options?: toDataURLOptions) {
    options = options || {};
    options.type = options.type || "image/png";
    
    var imageRect: {width: number; height: number},
        contentHeight: number, contentWidth: number,
        padding = options.padding || 0;
    
    var clientRect = paper.viewport.getBoundingClientRect();
    imageRect = fitRectKeepingAspectRatio(
        clientRect.width || 1, clientRect.height || 1,
        options.width, options.height);
    
    padding = Math.min(padding, imageRect.width / 2 - 1, imageRect.height / 2 - 1);
    contentWidth = imageRect.width - 2 * padding;
    contentHeight = imageRect.height - 2 * padding;
    
    var img = new Image;
    var svg;
    img.onload = function () {
        var dataURL: string, context: CanvasRenderingContext2D, canvas: HTMLCanvasElement;

        function createCanvas() {
            canvas = document.createElement("canvas");
            canvas.width = imageRect.width;
            canvas.height = imageRect.height;
            context = canvas.getContext("2d");
            context.fillStyle = options.backgroundColor || "white";
            context.fillRect(0, 0, imageRect.width, imageRect.height);
        }

        createCanvas();
        try {
            context.drawImage(img, padding, padding, contentWidth, contentHeight);
            dataURL = canvas.toDataURL(options.type, options.quality);
            callback(dataURL)
        } catch (e) {
            if (typeof canvg === "undefined") {
                return console.error("Canvas tainted. Canvg library required.");
            }
            createCanvas();
            const replaceSVGImagesWithSVGEmbedded = (svg: string) => {
                return svg.replace(/\<image[^>]*>/g, function (imageTag) {
                    var href = imageTag.match(/href="([^"]*)"/)[1];
                    var svgDataUriPrefix = "data:image/svg+xml";
                    if (href.substr(0, svgDataUriPrefix.length) === svgDataUriPrefix) {
                        var svg = decodeURIComponent(href.substr(href.indexOf(",") + 1));
                        return svg.substr(svg.indexOf("<svg"));
                    }
                    return imageTag;
                })
            }

            var canvgOpt = {ignoreDimensions: true, ignoreClear: true, offsetX: padding, offsetY: padding, useCORS: true};
            canvg(canvas, svg, _.extend({}, canvgOpt, {renderCallback: function () {
                try {
                    dataURL = canvas.toDataURL(options.type, options.quality);
                    callback(dataURL);
                } catch (e) {
                    svg = replaceSVGImagesWithSVGEmbedded(svg);
                    createCanvas();
                    canvg(canvas, svg, _.extend({}, canvgOpt, {renderCallback: function () {
                        dataURL = canvas.toDataURL(options.type, options.quality);
                        callback(dataURL);
                    }}))
                }
            }}));
            return;
        }
    }
    var svgOptions = _.clone(options.svgOptions || { convertImagesToDataUris: true});
    svgOptions.convertImagesToDataUris = true;
    toSVG(paper, function (svgString) {
        svg = svgString = svgString.replace('width="100%"', 'width="' + contentWidth + '"').replace('height="100%"', 'height="' + contentHeight + '"');
        img.src = "data:image/svg+xml," + encodeURIComponent(svgString);
    }, svgOptions);
}

export function fitRectKeepingAspectRatio(
    sourceWidth: number, sourceHeight: number,
    targetWidth: number, targetHeight: number): {width: number; height: number}
{
    if (!targetWidth && !targetHeight) {
        return {width: sourceWidth, height: sourceHeight};
    }
    var sourceAspectRatio = sourceWidth / sourceHeight;
    targetWidth = targetWidth || targetHeight * sourceAspectRatio;
    targetHeight = targetHeight || targetWidth / sourceAspectRatio;
    if (targetHeight * sourceAspectRatio <= targetWidth) {
        return {width: targetHeight * sourceAspectRatio, height: targetHeight};
    } else {
        return {width: targetWidth, height: targetWidth / sourceAspectRatio};
    }
}

/**
  * Creates and returns a blob from a data URL (either base64 encoded or not).
  *
  * @param {string} dataURL The data URL to convert.
  * @return {Blob} A blob representing the array buffer data.
  */
export function dataURLToBlob(dataURL: string): Blob {
    var BASE64_MARKER = ';base64,';
    if (dataURL.indexOf(BASE64_MARKER) == -1) {
        var parts = dataURL.split(',');
        var contentType = parts[0].split(':')[1];
        var raw = decodeURIComponent(parts[1]);
        
        return new Blob([raw], {type: contentType});
    }
    
    var parts = dataURL.split(BASE64_MARKER);
    var contentType = parts[0].split(':')[1];
    var raw = window.atob(parts[1]);
    var rawLength = raw.length;
    
    var uInt8Array = new Uint8Array(rawLength);
    
    for (var i = 0; i < rawLength; ++i) {
        uInt8Array[i] = raw.charCodeAt(i);
    }
    
    return new Blob([uInt8Array], {type: contentType});
}
