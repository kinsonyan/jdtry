<template>
<div class='contents'>
    <van-tabs v-model="activeTabName" sticky>
        <van-tab title="任务列表" name="taskpanel">
            <taskpanel :taskId="runtime.taskId" :taskPercentage="taskPercentage" :applidActivityNum="saveinfo.applidActivityNum" @execute="execute"></taskpanel>
        </van-tab>
        <van-tab title="任务设置" name="settings">
            <settings></settings>
        </van-tab>
        <van-tab title="商品列表" name="activityItems" :badge="activeSqlActivityItems.length">

            <itemList :list="activeSqlActivityItems" @filter="filterSqlActivityItems">
                <template #actions="props">
                    <van-button v-if="props.item.status== ACTIVITY_STATUS.APPLIED" disabled plain hairline size="small" type="info">已申请</van-button>
                    <van-button v-else-if="runtime.applyingActivityIds.indexOf(props.item.id) >=0" loading plain hairline size="small" type="info" loading-text="申请" class=""></van-button>
                    <van-button v-else @click="activityApply(props.item)" plain hairline size="small" type="info" class="">申请</van-button>
                    <van-button @click="deleteActivityItem(props.item)" plain hairline size="small" type="info" class=""> 删除 </van-button>
                </template>
            </itemList>

        </van-tab>
        <van-tab title="成功列表" name="successActivityItems" :badge="activeSuccessActivityItems.length">

            <itemList :list="activeSuccessActivityItems" @filter="filterSuccessActivityItems" :default_day=14>
                <template #actions="props">
                    <van-button @click="deleteSuccessActivityItem(props.item)" plain hairline size="small" type="info" class=""> 删除 </van-button>
                </template>
            </itemList>

        </van-tab>
    </van-tabs>
    <van-tabbar>
        <van-tabbar-item :title="descriptionWithTime" v-tippy @click="checkLoginStatus">
            <!-- TODO 这里应该是三个状态 -->
            <span :class="loginStatus.status===USER_STATUS.LOGIN?'login':'not-login'">{{loginStatus.shortDescription}}</span>
            <template #icon>
                <img :src="loginStatus.status===USER_STATUS.LOGIN?'../img/user-active.png':'../img/user-inactive.png'" />
            </template>
        </van-tabbar-item>
        <van-tabbar-item :title="`当前关注了${saveinfo.followVenderNum}个店铺。用户关注店铺上限为500个。每日最多增加300个关注店铺，请按时清理。`" v-tippy icon="like-o" :badge="saveinfo.followVenderNum">
            关注
        </van-tabbar-item>
        <van-tabbar-item title="点击查看本插件的全部代码" v-tippy icon="../img/github.png" @click="openGithub">
			源代码{{currentVersion}}
        </van-tabbar-item>
    </van-tabbar>
</div>
</template>

<script>
import {
    getActivityItems,
    getSuccessActivityItems,
    deleteItems
} from '../static/db'
import {
    storage
} from '../static/utils'
import {
    Toast,
} from 'vant';

import itemList from './itemList'
import settings from './settings'
import taskpanel from './taskpanel'
import {
    ACTIVITY_STATUS,
    USER_STATUS
} from '../static/config'
import {
    readableTime
} from '../static/utils'
import {
    updateTaskInfo, TASK_ID
} from '../static/tasks'

const bg = chrome.extension.getBackgroundPage()

export default {
    name: 'App',
    components: {
        settings,
        itemList,
        taskpanel
    },
    data() {
        return {
            activeTabName: 'taskpanel',
            activity: {
                sql: {
                    items: [],
                    day: 1,
                    filter: ''

                },
                success: {
                    items: [],
                    day: 14,
                    filter: ''
                }
            },
            loginStatus: bg.loginStatus,
            runtime: bg.runtime,
            saveinfo: bg.saveinfo,
            USER_STATUS: USER_STATUS,
			ACTIVITY_STATUS: ACTIVITY_STATUS,
			currentVersion:"{{version}}"
        }
    },
    destroyed() {
        //因为 loginStatus 这些参数是 window 生命周期的，如果不手动释放的话会导致内存泄露
        bg.loginStatus = Object.assign({}, bg.loginStatus)
        bg.runtime = Object.assign({}, bg.runtime)
        bg.saveinfo = Object.assign({}, bg.saveinfo)
    },
    mounted() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            switch (message.action) {
                case "popup_update_activity":
                    Toast('刷新商品列表')
                    this.renderSqlActivityItems()
                    break;
                case "popup_update_success_activity":
                    Toast('有新的成功的项目')
                    this.renderSuccessActivityItems();
                    break;
                case "popup_update_activity_status":
                    this.updateACTIVITY_STATUS(message.activityId, message.status);
                    break;
                default:
                    break;
            }
        })

        this.renderSqlActivityItems()
        this.renderSuccessActivityItems()
        if (this.loginStatus.status === USER_STATUS.UNKNOWN
			// ||this.loginStatus.status === USER_STATUS.LOGOUT
			) {
            bg.joinTaskInQueue(TASK_ID.CHECK_OR_DO_LOGIN_OPT, true)
        }
    },
    computed: {
        descriptionWithTime() {
			if(this.loginStatus.timestamp){
				return `${this.loginStatus.description} | 检查时间：${readableTime(this.loginStatus.timestamp)}`
			}
			return this.loginStatus.description
        },
        disable_event: function () {
            if (this.loginStatus.status !== this.USER_STATUS.LOGIN) {
                Toast('未登录')
                return true
            }
            if (this.runtime.taskId !== -1) {
                Toast('已有任务正在进行')
                return true
            }
            return false
        },
        activeSqlActivityItems: function () {
            return this.activity.sql.items.filter(item => {
                const filter = this.activity.sql.filter
                if (filter) {
                    return item.name.indexOf(filter) >= 0
                }
                return true
            })
        },
        activeSuccessActivityItems: function () {
            return this.activity.success.items.filter(item => {
                const filter = this.activity.success.filter
                if (filter) {
                    return item.name.indexOf(filter) >= 0
                }
                return true
            })
        },
        taskPercentage() {
            if (this.runtime.totalTask === 0) {
                return 100
            }
            return (100 * this.runtime.doneTask / this.runtime.totalTask).toFixed(0)
        }

    },
    methods: {
        activityApply(activity) {
			Toast(`即将执行 ${activity.id} 任务`)
			bg.joinTaskInQueue(TASK_ID.ACTIVITY_APPLY, true, {activity:[activity]})
        },
        deleteActivityItem(activityItem) {
            this.activity.sql.items = this.activity.sql.items.filter(item => item.id !== activityItem.id)
            deleteItems({
                database: 'activity',
                id: activityItem.id
            })
        },
        deleteSuccessActivityItem(activityItem) {
            this.activity.success.items = this.activity.success.items.filter(item => item.id !== activityItem.id)
            deleteItems({
                database: 'success',
                id: activityItem.id
            })
        },
        updateACTIVITY_STATUS(activityId, status) {
            for (let item of this.activeSqlActivityItems) {
                if (item.id === activityId) {
                    item.status = status ? ACTIVITY_STATUS.APPLIED : ACTIVITY_STATUS.APPLY
                    break
                }
            }
        },
        renderSqlActivityItems() {
            getActivityItems(this.activity.sql.day).then(res => {
                this.activity.sql.items = res
            })
        },
        renderSuccessActivityItems() {
            getSuccessActivityItems(this.activity.success.day).then(res => {
                this.activity.success.items = res
            })
        },
        filterSqlActivityItems(msg) {
            console.log("filter", msg)
            if (this.activity.sql.filter !== msg.filter) {
                this.activity.sql.filter = msg.filter
            }
            if (msg.day !== this.activity.sql.day) {
                this.activity.sql.day = msg.day
                this.renderSqlActivityItems()
            }
        },
        filterSuccessActivityItems(msg) {
            console.log(`success ${msg.day} ${msg.filter}`)
            if (this.activity.success.filter !== msg.filter) {
                this.activity.success.filter = msg.filter
            }
            if (msg.day !== this.activity.success.day) {
                this.activity.success.day = msg.day
                this.renderSqlActivityItems()
            }
        },
        checkLoginStatus() {
            switch (this.loginStatus.status) {
                case this.USER_STATUS.UNKNOWN:
                    bg.joinTaskInQueue(TASK_ID.CHECK_OR_DO_LOGIN_OPT, true)
                    break
                case this.USER_STATUS.LOGOUT:
                    chrome.tabs.create({
                        url: 'https://passport.jd.com/new/login.aspx',
                        active: true
                    })
                    break
            }
        },
        openGithub() {
            chrome.tabs.create({
                url: 'https://github.com/ZCY01/jdtry',
                active: true
            })
        },
        execute(task) {
            // if (this.loginStatus.status === USER_STATUS.WARMING) {
            //     Toast('正在检查登录状态，请稍后')
            //     return
            // }
            // if (this.loginStatus.status === USER_STATUS.LOGOUT) {
            //     Toast('未登录！请手动登录！')
            //     return
            // }
            if (this.runtime.taskId !== -1){
                Toast(`${task.title} 已加入任务队列`)
			}
			bg.joinTaskInQueue(task, true)
        }
    }
}
</script>