'use strict'
const EventEmitter = require('events')
const Ajv = require('ajv')
const { OpenRTBValidationError, OpenRTBParseError } = require('./errors')
const { buildPayloadPrototype } = require('./payload')

module.exports = class extends EventEmitter {
  constructor (schema, opt = {}) {
    super()
    opt = Object.assign({ emitErrors: false }, opt)
    opt = Object.assign({ whitelist: [], blacklist: [] }, opt)

    // validate all errors if options have whitelist or blacklist
    if (opt.whitelist.length || opt.blacklist.length) {
      opt.allErrors = true
    }

    if (!schema || schema.constructor.name !== 'Schema') throw new Error('expecting schema to be a valid Schema object')
    this._schema = schema
    this._whitelist = opt.whitelist
    this._blacklist = opt.blacklist

    this._ajv = new Ajv({
      allErrors: opt.hasOwnProperty('allErrors') ? opt.allErrors : false,
      removeAdditional: opt.hasOwnProperty('removeAdditional') ? opt.removeAdditional : false,
      coerceTypes: opt.hasOwnProperty('coerceTypes') ? opt.coerceTypes : false,
      useDefaults: opt.hasOwnProperty('useDefaults') ? opt.useDefaults : false
    })
    this._ajvValidate = this._ajv.compile(this._schema.root)

    this._Payload = opt.Payload || buildPayloadPrototype(this)
    this._emitErrors = opt.emitErrors
  }
  _jsonParse (data) {
    try {
      return {
        data: JSON.parse(data)
      }
    } catch (e) {
      return {
        error: e
      }
    }
  }
  validate (data) {
    if (typeof data === 'string') {
      let rsp = this._jsonParse(data)
      if (rsp.error) {
        let error = new OpenRTBParseError(String(rsp.error))
        this._emitErrors && this.emit('error', error)
        return { error }
      }
      data = rsp.data
    }
    if (!this._ajvValidate(data)) {
      let ajvErrors = this._getAjvErrors()
      if (ajvErrors.length) {
        let error = new OpenRTBValidationError(ajvErrors)
        this._emitErrors && this.emit('error', error)
        return { error }
      }
    }
    return { data }
  }
  open (data) {
    return new this._Payload(data, { parser: this })
  }
  get schema () {
    return this._schema
  }
  _getAjvErrors () {
    var self = this
    return this._ajvValidate.errors.filter(function (error) {
      return self._passAjvError(error)
    })
  }
  _passAjvError (ajvError) {
    const dataPath = ajvError.dataPath
    const path = dataPath.replaceAll(/\[\d+\]/gi, '')

    if (this._blacklist.includes(path) || this._blacklist.includes(dataPath)) {
      return false
    }

    if (this._whitelist.length && !(this._whitelist.includes(path) || this._whitelist.includes(dataPath))) {
      return false
    }

    return true
  }
}
