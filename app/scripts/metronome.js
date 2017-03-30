'use strict';

/**

@TODOs

- Set BPM to 30, play, change to 180. It does a loop. Remove overflow to see!
    - Only occurs when BPM change is pretty large
    - So... time deltas... put it into the next beat or
X Prevent overlapping sounds when adding an accent on a current beat
?  And sometimes cutting off a currently playing beat
*/


/**
 * - Starting UI without a plan
 *  - Visual design plan
 *  - Visual interface interaction plan
 *  - UI Class design
 * - Addressing UI too early or too late
 * - Fooling around with colors to early
 *
 * - Not starting with objects & APIs/interfaces
 * - Over-focusing on unnecessary implementation details
 * - Adding and removing features
 * - Repeated refactorings
 *  - Not designing object and thinking of it's responsibilities
 *  - Not properly initializing (or resetting, if possible)
 * - 
 */
function Metronome() {

    const that = this

    const audioCtx = new(
        window.AudioContext ||
        window.webkitAudioContext ||
        window.mozAudioContext ||
        window.oAudioContext ||
        window.msAudioContext
    );

    /**
     * Constant properties
     */

    const BPM_MIN = 20;
    const BPM_MAX = 260;
    const BPM_DEFAULT = 60;

    const scheduleAheadTime = 5;        // seconds
    const schedulerIntervalDelay = 500; // milliseconds

    /**
     * Private properties
     */

    // Audio
    let masterGain;
    let compressor;
    let beatOscillator;
    let beatGain;
    let accentOscillator;
    let accentGain;
    let iosBuffer;
    let iosSource;

    // Speed
    let bpm = BPM_DEFAULT;

    // Time signature
    let signatureCounter = 4;
    let signatureLength = 4;
    
    // Scheduler
    let isPlaying;
    let schedulerIntervalID;
    let totalBeatsScheduled;
    let startTime;
    let stopTime;
    let nextScheduledNoteTime;
    let nextPlayingNoteTime;
    let soundQueue = [];

    // Accents
    let accents = []
    
    /**
     * Public properties
     */

    this.audioCtx = audioCtx;

    this.BPM_DEFAULT = BPM_DEFAULT;
    this.BPM_MIN = BPM_MIN;
    this.BPM_MAX = BPM_MAX;

    /**
     * Private methods
     */

    function enqueue(time) {
        let beatNumber = (totalBeatsScheduled % signatureLength) + 1;
        soundQueue.push({ 
            time: time, 
            beatNumber: beatNumber, 
            totalBeatsScheduled: totalBeatsScheduled
        });

        if (!getAccentAtBeatIndex(beatNumber - 1)) {
            that.playBeat(time, (60 / bpm) / signatureLength);
        } else {
            that.playAccent(time, (60 / bpm) / signatureLength);
        }
        
    };

    function scheduler() {
        // console.log('metronome:scheduler', audioCtx.currentTime.toPrecision(8))

        if (isPlaying) {

            // Opening note not on this.play() but one beat afterwards
            if (!nextScheduledNoteTime) {
                nextScheduledNoteTime = startTime + (60 / bpm);
            }

            // Calculate notes that fall within scheduling window
            while (audioCtx.currentTime + scheduleAheadTime > nextScheduledNoteTime) {
                enqueue(nextScheduledNoteTime);
                nextScheduledNoteTime += 60 / bpm;
                totalBeatsScheduled += 1;
            }

        }

        // Purge notes we've already processed
        while (soundQueue.length && soundQueue[0].time < audioCtx.currentTime) {
            soundQueue.splice(0,1);
        }

    };

    function findNextPlayingNote() {
        let currentTime = audioCtx.currentTime;

        let futureNotes = [];

        if (!stopTime) {
            futureNotes = soundQueue.filter(function (n) {
                return n.time > currentTime
            });
        } else {
            futureNotes = soundQueue.filter(function (n) {
                return n.time > stopTime
            });
        }

        return futureNotes.length ? futureNotes[0] : null;
    };

    function cancelAudioFromTime(time) {
        time = time ? time : audioCtx.currentTime - (60/bpm);

        // Remove beats & accents
        beatGain.gain.value = 0;
        accentGain.gain.value = 0;
        
        beatGain.gain.cancelScheduledValues(time);
        accentGain.gain.cancelScheduledValues(time);
    }

    function cancelScheduledAudio() {

        // Find the next note
        let nextPlayingNote = findNextPlayingNote();

        // Reschedule after next note
        if (nextPlayingNote) {
            nextScheduledNoteTime = nextPlayingNote.time;
            nextPlayingNoteTime = nextPlayingNote.time;
            totalBeatsScheduled = nextPlayingNote.totalBeatsScheduled;
            soundQueue.splice(0, soundQueue.length);
            soundQueue.push(nextPlayingNote);
            
            // cancelAudioFromTime(nextPlayingNoteTime + (60/bpm)) // Why was this 60/bpm?
            cancelAudioFromTime(nextPlayingNoteTime)
        } else {
            cancelAllAudio();
        }
    };

    function cancelAllAudio() {
        let time = audioCtx.currentTime - (60/bpm);
        cancelAudioFromTime(time)
    }

    function setMasterVolume(n) {
        masterGain.gain.value = n;
    };

    function bpmMinMax(n) {
        if (n < BPM_MIN) {
            return BPM_MIN;
        }
        if (n > BPM_MAX) {
            return BPM_MAX;
        }

        return n;
    };

    function resetAccents() {
        accents = []

        for (let i = 0; i < signatureCounter; i++) {
            accents.push(0);
        }
    };

    function getAccentAtBeatIndex(idx) {
        if (idx >= 0 && idx <= accents.length) {
            return accents[idx];
        }
        return 0;
    };

    function setAccentAtBeatIndex(idx, val) {
        if (idx >= 0 && idx <= accents.length) {
            accents[idx] = val;

            // Updating accents requires we replace all
            // future audio events with the correct set
            // of beats and notes
            cancelScheduledAudio();
            scheduler();


            
            console.log(soundQueue);
        }
    };

    /**
     * Public methods
     */

    this.initAudio = function() {

        /**
         * iOS Audio initalization
         * @see https://paulbakaus.com/tutorials/html5/web-audio-on-ios/
         */
        iosBuffer = audioCtx.createBuffer(1, 1, 22050);
        iosSource = audioCtx.createBufferSource();
        iosSource.audioContext = iosBuffer;
        iosSource.connect(audioCtx.destination);
        iosSource.start(0);

        masterGain = audioCtx.createGain();
        masterGain.gain.value = 1;
        masterGain.connect(audioCtx.destination);

        compressor = audioCtx.createDynamicsCompressor();
        compressor.connect(masterGain);

        // Create beat
        beatOscillator = audioCtx.createOscillator();
        beatOscillator.type = 'sine';
        beatOscillator.frequency.value = 440;
        beatGain = audioCtx.createGain();
        beatGain.gain.value = 0;

        // Connect beat
        beatOscillator.connect(beatGain);
        beatGain.connect(compressor);
        beatOscillator.start(0);

        // Create accent
        accentOscillator = audioCtx.createOscillator();
        accentOscillator.type = 'sine';
        accentOscillator.frequency.value = 880;
        accentGain = audioCtx.createGain();
        accentGain.gain.value = 0;

        // Connect accent
        accentOscillator.connect(accentGain);
        accentGain.connect(compressor);
        accentOscillator.start(0);
    };

    this.playBeat = function(time, length) {
        // @NOTE Apparently IOS time is slightly off
        //       Push ahead by 10ms to ensure playback?
        beatGain.gain.setValueAtTime(0, time);
        beatGain.gain.linearRampToValueAtTime(1, time + 0.01);
        beatGain.gain.linearRampToValueAtTime(0, time + length);
    }

    this.playAccent = function(time, length) {
        // @NOTE Apparently IOS time is slightly off
        //       Push ahead by 10ms to ensure playback?
        accentGain.gain.setValueAtTime(0, time);
        accentGain.gain.linearRampToValueAtTime(1, time + 0.01);
        accentGain.gain.linearRampToValueAtTime(0, time + length);
    }

    this.start = function() {
        if (!isPlaying) {
            isPlaying = true;
            totalBeatsScheduled = 0;
            startTime = audioCtx.currentTime;
            stopTime = null;
            nextScheduledNoteTime = 0.0;
            nextPlayingNoteTime = 0.0;
            soundQueue = [];

            scheduler();
            schedulerIntervalID = setInterval(scheduler, schedulerIntervalDelay);
        }
    };

    this.stop = function() {
        if (isPlaying) {
            isPlaying = false;
            stopTime = audioCtx.currentTime;

            cancelAllAudio();
            schedulerIntervalID = clearInterval(schedulerIntervalID);
        }
    };

    this.mute = function() {
        setMasterVolume(0);
    }

    this.unmute = function() {
        setMasterVolume(1);
    }

    this.bpmMinMax = bpmMinMax;

    /**
     * Properties:getters
     */

    this.getBpm = function() { return bpm; };
    this.getSignatureCounter = function(n) { return signatureCounter; }
    this.getSignatureLength = function(n) { return signatureLength; }
    this.getIsPlaying = function() { return isPlaying; };
    this.getStartTime = function() { return startTime; };
    this.getStopTime = function() { return stopTime; };
    this.getNextPlayingNote = function() { return findNextPlayingNote(); };
    this.getTempo = function() { return 60 / bpm; };
    this.getAccentAtBeat = function(n) { return getAccentAtBeatIndex(n - 1); }

    /**
     * Properties:setters
     */
    
    this.setSignatureCounter = function(n) { 
        signatureCounter = n; 
        resetAccents();
    }
    
    this.setSignatureLength = function(n) { 
        signatureLength = n;
        resetAccents();
    }

    this.setBpm = function(n) { 
        // We can't change the tempo while playing.
        that.stop();
        bpm = n; 
    };

    this.addAccentAtBeat = function(n) {
        setAccentAtBeatIndex(n - 1, 1);
    };

    this.removeAccentAtBeat = function(n) {
        setAccentAtBeatIndex(n - 1, 0);
    };

    /**
     * Constructor
     */
    resetAccents();
}


function MetronomeUI(metronome) {

    const m = metronome
    const audioCtx = metronome.audioCtx

    /**
     * UI
     */
    const $metronomeContainer = $('.metronome-container');
    const $beatContainer = $('.beat-container');
    const $controlsContainer = $('.controls-container')

    // Metronome elements
    let $metronome;
    let $rod;
    let $bob;
    let $base;
    let $left;
    let $right;

    // Control elements
    let $bpm;
    let $signature;
    let $start;
    let $stop;
    let $mute;
    let $unmute;

    // RequestAnimation (Possibly unnecessary?)
    let animationHandler; 

    var opts = {
        width: 240,
        height: 480,
        borderWidth: 1,
        bobWidth: 12,
        bobHeight: 20,
        rodWidth: 1,
        rodAngle: null // Dynamic. See calcRodAngleExtents
    }

    opts.width = $metronomeContainer.width()
    // opts.height = $('.metronome-container').height() - $('.controls-container').height() - $('.beat-container').height() - 6;
    opts.rodAngle = calcRodAngleExtents();

    var timeSignatures = [
        {
            name: '4/4',
            beatCount: 4,
            beatLength: 4,
        },
        {
            name: '2/4',
            beatCount: 2,
            beatLength: 4,
        },
        {
            name: '3/4',
            beatCount: 3,
            beatLength: 4,
        },
        {
            name: '6/8',
            beatCount: 6,
            beatLength: 8,
        },
        {
            name: '2/2',
            beatCount: 2,
            beatLength: 2,
        }
    ]

    function init() {
        $metronomeContainer
            .empty()
            .append(initMetronome());

        $beatContainer
            .empty()
            .append(initBeatBar());

        // Controls do not need to be constructed.
        initControls();

        // Draw arm at initial position (upright)
        updateMetronomeArm(0);
    }

    function initMetronome() {    
        $metronome = $('<div />').addClass('metronome')
        $rod = $('<div />').addClass('rod')
        $bob = $('<div />').addClass('bob')
        $base = $('<div />').addClass('base')
        $left = $('<div />').addClass('left')
        $right = $('<div />').addClass('right')

        $metronome
            .append($base)
            .append($left)
            .append($right)
            .append($rod)
            .append($bob)

        $metronome.css({
            'position':'relative',
            'width': px(opts.width),
            'height': px(opts.height),
            'border-width': opts.borderWidth
        })

        $base.css({
            'position': 'absolute',
            'width': px(opts.width),
            'height': px(opts.width / 4),
            'transform-origin': pxs(
                0,
                0
            ),
            'transform': trns(
                0,
                (opts.height - (opts.width / 8)),
                0
            )
        })
        $left.css({
            'position': 'absolute',
            'width': px(opts.width / 2),
            'height': px(opts.height * 2),
            'transform-origin': pxs(
                opts.width / 2,
                opts.height * 2
            ),
            'transform': trns(
                0 - (opts.borderWidth * 2),
                (-1 * opts.height) - (opts.borderWidth * 2),
                -1 * (opts.rodAngle / 2)
            )
        })
        $right.css({
            'position': 'absolute',
            'width': px(opts.width / 2),
            'height': px(opts.height * 2),
            'transform-origin': pxs(
                0,
                opts.height * 2
            ),
            'transform': trns(
                (opts.width / 2) - (opts.borderWidth * 4),
                (-1 * opts.height) + (opts.borderWidth * 4),
                (opts.rodAngle / 2)
            )
        })
        $rod.css({
            'position': 'absolute',
            'width': px(opts.rodWidth),
            'height': px(opts.height * 2),
        })
        $bob.css({
            'position': 'absolute',
            'width': px(opts.bobWidth),
            'height': px(opts.bobHeight),
        })

        return $metronome;       
    }

    function initBeatBar() {
        let $bar = $('<div />').addClass('bar');

        for (var i = 0; i < m.getSignatureCounter(); i++) {
            let $item = $('<div />')
                .addClass('item')
                .attr('data-beat-number', i + 1);
            let $beat = $('<div />')
                .addClass('beat');
            let $accent = $('<div />')
                .addClass('accent');
            $item
                .append($beat)
                .append($accent)
                .appendTo($bar);

            $item.on('click', (e) => {
                var $el = $(e.currentTarget);
                let beatNumber = $el.attr('data-beat-number')

                console.log('ui:updateAccent')

                if (!m.getAccentAtBeat(beatNumber)) {
                    $el.addClass('accent');
                    m.addAccentAtBeat(beatNumber)
                } else {
                    $el.removeClass('accent');
                    m.removeAccentAtBeat(beatNumber)
                }    
            })

        }

        return $bar;
    }

    function initControls() {
        $bpm = $controlsContainer.find('[name=bpm]')
        $signature = $controlsContainer.find('[name=signature]');
        $start = $controlsContainer.find('.start');
        $stop = $controlsContainer.find('.stop');
        $mute = $controlsContainer.find('.mute');
        $unmute = $controlsContainer.find('.unmute');

        $start.one('touch', onStartTouch);
        $start.on('click', onStartClick);
        $stop.on('click', onStopClick);
        $mute.on('click', onMuteClick);
        $unmute.on('click', onUnmuteClick);
        $bpm.on('change', onBpmChange);
        $signature.on('change', onSignatureChange);

        // Set initial control visibilities
        $stop.hide();
        $unmute.hide();
    }

    function onStartTouch(e) {
        // @TODO Initialize iOS audio on touchstart event.
        m.initIOSAudio();
    }

    function onStartClick(e) {
        if (!m.getIsPlaying()) {
            console.log('ui:start ' + m.audioCtx.currentTime);
            m.start();
            $start.hide();
            $stop.show();
            animationHandler = step();
        }
    }

    function onStopClick(e) {
        if (m.getIsPlaying()) {
            console.log('ui:stop ' + m.audioCtx.currentTime);
            m.stop();
            $stop.hide();
            $start.show();

            $beatContainer
                .find('.item.current')
                .removeClass('current')
        }
    }

    function onMuteClick(e) {
        m.mute();
        $mute.hide();
        $unmute.show();
    }

    function onUnmuteClick(e) {
        m.unmute();
        $unmute.hide()
        $mute.show();
    }

    function onBpmChange(e) {
        // @TODO Must wait on stop function to finish before changing BPM
        // Update UI before metronome
        $stop.click();

        let newBpm = parseInt($(e.target).val());
        $bpm.val(m.bpmMinMax(newBpm));
        m.setBpm(m.bpmMinMax(newBpm));
    }

    function onSignatureChange(e) {
        // Update UI before metronome
        $stop.click();

        let idx = parseInt($(e.target).val());
        m.setSignatureCounter(timeSignatures[idx].beatCount);
        m.setSignatureLength(timeSignatures[idx].beatLength);
    }

    function step(ts) {

        let currentTime = m.audioCtx.currentTime;
        let startTime = m.getStartTime();
        let stopTime = m.getStopTime();
        let isPlaying = m.getIsPlaying();
        let tempo = m.getTempo();
        let nextNote = m.getNextPlayingNote();
        let nextTime = nextNote.time;
        let totalBeatsPlayed = nextNote.totalBeatsScheduled;
        let beat = totalBeatsPlayed % m.getSignatureCounter();
        let direction = totalBeatsPlayed % 2 ? 1 : -1;

        // console.log('step', {
        //     'totalBeatsPlayed': totalBeatsPlayed,
        //     'beat': beat,
        //     'currentTime': currentTime,
        //     'nextTime': nextTime,
        //     'startTime': startTime,
        //     'stopTime': stopTime
        // })

        if (isPlaying == true) {

            let $items = $beatContainer.find('.item');
            
            if (totalBeatsPlayed !== 0) {
                $items
                    .removeClass('current')
                    .eq(beat - 1)
                    .addClass('current');
            }

            if (totalBeatsPlayed === 0) {
                let currentTimeDelta = calcVariableDelta(0, 0.5, startTime, currentTime, tempo*2);
                let currentAngle = calcAngle(0.5 - currentTimeDelta, opts.rodAngle);

                updateMetronomeArm(currentAngle);
            } else {
                let currentTimeDelta = calcDelta(currentTime, nextTime, tempo);
                let currentAngleDelta = direction > 0
                    ? 0+currentTimeDelta
                    : 1-currentTimeDelta;
                let currentAngle = calcAngle(currentAngleDelta, opts.rodAngle);

                updateMetronomeArm(currentAngle);
            }
        } else {
            if (totalBeatsPlayed === 0) {
                let stopTimeDelta = calcVariableDelta(0, 0.5, startTime, currentTime, tempo*2);

                let currentTimeDelta = calcVariableDelta(0.5 - stopTimeDelta, 0.5, stopTime, currentTime, tempo >= 60 ? (tempo * 2) : (tempo / 2));
                let currentAngle = calcAngle(currentTimeDelta, opts.rodAngle);

                updateMetronomeArm(currentAngle);
            } else {
                let stopTimeDelta = calcDelta(stopTime, nextTime, tempo);
                let stopAngleDelta = direction > 0
                    ? 0+stopTimeDelta
                    : 1-stopTimeDelta;

                let currentTimeDelta = calcVariableDelta(stopAngleDelta, 0.5, stopTime, currentTime, tempo / 2);
                let currentAngle = calcAngle(currentTimeDelta, opts.rodAngle);

                updateMetronomeArm(currentAngle);
            }
        }

        animationHandler = requestAnimationFrame(step)
    }

    function updateMetronomeArm(angle) {
        $rod.css({
            'transform-origin': pxs(
                opts.rodWidth / 2,
                opts.height * 2
            ),
            'transform': trns(
                (opts.width / 2) - (opts.rodWidth / 2) - opts.borderWidth,
                -1 * opts.height,
                angle
            )
        })

        $bob.css({
            'transform-origin': pxs(
                opts.bobWidth / 2,
                opts.bobHeight + calcBobPosition()
            ),
            'transform': trns(
                (opts.width / 2) - (opts.bobWidth / 2) - opts.borderWidth,
                opts.height - opts.bobHeight - calcBobPosition(),
                angle
            )
        })
    }

    function calcBobPosition() {
        let bpmAverage = (m.getBpm() - m.BPM_MIN) / (m.BPM_MAX - m.BPM_MIN)
        return (bpmAverage * opts.height * 0.8) + opts.height * 0.2
    }

    /**
     * Given endTime, calculates startTime (using tempo) and
     * calculates delta of currentTime towards endTime
     *
     * Used to animate the active, running metronome.
     * 
     * @param  {float} (seconds) Timestamp
     * @param  {float} (seconds) Timestamp
     * @param  {float} (seconds) Timestamp
     * @return {float} Float (0.0 - 1.0) Delta towards endTime
     */
    function calcDelta(currentTime, endTime, tempo) {

        // JS can be funny with very, very tiny floats
        currentTime = parseFloat(currentTime.toPrecision(8));
        endTime = parseFloat(endTime.toPrecision(8));

        if (currentTime <= startTime) {
            return 0;
        }

        if (currentTime >= endTime) {
            return 1;
        }

        let startTime = endTime - tempo;

        let progress = (currentTime - startTime) / tempo;
        
        return parseFloat(progress.toPrecision(8));
    }

    /**
     * Given two delta, calculates delta from startDelta
     * towards endDelta. If startDelta is less than endDelta,
     * delta moves forward. If startDelta greater than endDelta,
     * delta moves backwards. 
     *
     * Used to animate the metronome into the starting position,
     * and to animate the metronome back into resting position.
     * 
     * 
     * @param  {float} (0.0 - 1.0) Delta to begin at
     * @param  {float} (0.0 - 1.0) Delta to end at
     * @param  {float} (seconds) Timestamp
     * @param  {float} (seconds) Timestamp
     * @param  {float} (seconds) Timestamp
     * @return {float} Float (0.0 - 1.0) Delta towards endTime
     */
    function calcVariableDelta(startDelta, endDelta, startTime, endTime, tempo) {

        // JS can be funny with very, very tiny floats
        startDelta = parseFloat(startDelta.toPrecision(8));
        endDelta = parseFloat(endDelta.toPrecision(8));

        let delta = (endTime - startTime) / tempo;
        
        if (startDelta < endDelta) {
            let pos = startDelta + delta;
            return pos > endDelta ? endDelta : pos;
        }

        if (startDelta > endDelta) {
            let pos = startDelta - delta;
            return pos < endDelta ? endDelta : pos;
        } 

        return endDelta
    }

    function calcAngle(timeDelta, angleSpan) {
        let theta = (timeDelta * angleSpan) - (angleSpan / 2);

        return theta;
    }

    function calcRodAngleExtents() {
        var mw = opts.width + (opts.borderWidth * 2);
        var mh = opts.height + (opts.borderWidth * 2);
        var rodAngle = (Math.atan((mw / 2)/mh) * (180 / Math.PI)) * 2;

        return rodAngle;
    }

    function trns(x, y, t) {
        return 'translate' + pxb(x, y) + 'rotate' + dg(t);
    }

    function px() {
        return Array.from(arguments).map( n => n + 'px').join(',');
    }

    function pxs() {
        return px.apply(null, arguments).replace(',', ' ');
    }

    function pxb() {
        return '(' + px.apply(null, arguments) + ')';
    }

    function dg(n) {
        return '(' + n + 'deg' + ')';
    }

    /**
     * Constructor
     */
    
    init();
}

function MetronomeTapper() {
    let tapWindow = 1000
    let tapCount = 0
    let tapFirstTime = 0
    let tapPreviousTime = 0
    $(document).on('keypress', (e) => {
        const LOWERCASE_T = 116;

        if (e.which == LOWERCASE_T) {

            let currentTime = window.performance.now();
            
            if ((currentTime - tapPreviousTime) > tapWindow) {
                tapCount = 0;
                tapFirstTime = 0;
                tapPreviousTime = 0;
            }

            if (tapCount === 0) {
                tapFirstTime = currentTime;
                tapPreviousTime = currentTime;
                tapCount++;
            } else {
                let bpmAverage = (60 * 1000 * tapCount) / (currentTime - tapFirstTime);
                tapPreviousTime = currentTime;
                tapCount++;
            }

        }
    })

    $(document).on('keypress', (e) => {
        const LOWERCASE_S = 115;

        if (e.which == LOWERCASE_S) {
            if (m.getIsPlaying()) {
                $stop.click();
            } else {
                $start.click();
            }
        }
    });
}
