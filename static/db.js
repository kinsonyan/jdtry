import Dexie from 'dexie'
import { notifications, NOTIFICATION_LEVEL, storage } from './utils'


//
// Declare Database
//

// Dexie.delete('JDTryDatabase');

const db = new Dexie("JDTryDatabase")
db.version(1).stores({
	activityItems: ",timestamp,price",
	successActivityItems: ",timestamp"
})

export async function addActivityItems(items) {
	let keys = []
	let newSuccess = true
	for (const item of items) {
		keys.push(item.id)
	}
	try {
		await db.activityItems.bulkAdd(items, keys)
	} catch (e) {
		// console.log(`activityItems add error:${e}`)
		newSuccess = e.failures.length !== items.length
	}
	if (newSuccess) {
		sendMessage({
			action: "popup_update_activity",
		})
	}
}

export async function getActivityItems(days = 20) {
	const now = Date.now()
	const endTimeOnFurture = now + 60 * 60 * 1000 * 24 * days
	await db.activityItems.where('timestamp').below(now).delete()

	let minPrice
	let keywordMasks
	await storage.get({
		keywordMasks: []
	}).then(res => keywordMasks = res.keywordMasks)
	await storage.get({
		minPrice: 0
	}).then(res => minPrice = res.minPrice)

	let items = await db.activityItems.where('timestamp')
		.below(endTimeOnFurture)
		.and(item => {
			// let num = parseInt(/提供(.*)份/.exec(item.detail)[1])
			if (item.deleted) {
				return false
			}
			for (let mask of keywordMasks) {
				if (item.name.indexOf(mask) >= 0) {
					return false
				}
			}
			if(item.try) return item.try<3
			return item.price >= minPrice
		})
		.sortBy('price')
	return items.reverse()
}

// export async function updateActivityItems(items){
// 	return db.activityItems.update(items)
// }

export async function addSuccessActivityList(items) {
	let keys = []
	let newSuccess = true
	for (const item of items) {
		keys.push(item.id)
	}
	try {
		await db.successActivityItems.bulkAdd(items, keys)
		//notify 有新的成功的项目
	} catch (e) {
		// console.log(`successActivityItems update error:${e}`)
		newSuccess = e.failures.length !== items.length
	}
	if (newSuccess) {
		sendMessage({
			action: "popup_update_success_activity",
		})
		notifications('恭喜！发现新的成功的商品！', null, NOTIFICATION_LEVEL.INFO)
		sendMessage({
			action: "bg_update_browser_action",
			force: true
		})
	}
}

export async function getSuccessActivityItems(days = 15) {
	const now = Date.now()
	const endTime = now + 60 * 60 * 1000 * 24 * days
	await db.successActivityItems.where('timestamp')
		.below(now)
		.delete()
		.then(deleted => {
			if (deleted) {
				sendMessage({
					action: "bg_update_browser_action",
					force: true
				})
			}
		})
	let items = await db.successActivityItems.where('timestamp')
		.below(endTime)
		.and(item => {
			return !item.deleted
		})
		.sortBy('timestamp')
	return items.reverse()
}
export function deleteItems(option) {
	if (option.database === 'activity') {
		db.activityItems.update(option.id, { deleted: true })
	}
	else { //success
		db.successActivityItems.update(option.id, { deleted: true })
		sendMessage({
			action: "bg_update_browser_action",
			force: true
		})
	}
}

export function updateActivityItemsStatus(activityId, data) {
	db.activityItems.update(activityId, data).then(function (updated) {
		if (!updated && typeof (activityId) !== 'number') {
			console.warn(`can not find ${activityId} activity, remember that id is Number, ${typeof (activityId)}`);
		}
	})
}

export function clearActivityItems() {
	db.activityItems.clear().then(() => {
		sendMessage({
			action: "popup_update_activity",
		})
	})
}